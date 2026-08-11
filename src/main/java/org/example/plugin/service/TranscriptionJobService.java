package org.example.plugin.service;

import java.io.IOException;
import java.io.RandomAccessFile;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import java.util.logging.Level;
import java.util.logging.Logger;

import org.example.plugin.model.TranscriptionResult;
import org.example.plugin.web.dto.TranscribeJobStatus;
import org.example.plugin.web.dto.TranscribeResponse;
import org.springframework.stereotype.Service;

/**
 * Runs "Subtitr yaratish" as a background job instead of one long blocking HTTP request, so the
 * panel can poll for progress instead of staring at a single static "busy" spinner for however
 * long Whisper+Gemini take. Neither of those APIs exposes real fine-grained progress (they're
 * single-shot calls, not streamed), so the "transcribing" stage's percentage is a time-based
 * estimate (elapsed vs. an expected duration guessed from the audio's own length) rather than
 * something truly instrumented — the same practical compromise most such systems make.
 */
@Service
public class TranscriptionJobService {

    private static final Logger LOG = Logger.getLogger(TranscriptionJobService.class.getName());

    // Rough heuristic, not a measured constant: Whisper+Gemini together (run in parallel
    // server-side) have generally taken a fraction of the audio's own duration, plus a fixed
    // overhead for network round-trips. Only used to pace the progress bar, not for anything
    // that affects correctness — a wrong guess just makes the bar move a bit too fast/slow.
    private static final double ESTIMATED_SECONDS_PER_AUDIO_SECOND = 0.6;
    private static final double ESTIMATED_FIXED_OVERHEAD_SECONDS = 5.0;

    private final AudioExtractionService audioExtractionService;
    private final GeminiTranscriptionService geminiTranscriptionService;
    private final WhisperTranscriptionService whisperTranscriptionService;
    private final SrtBuilderService srtBuilderService;

    private final Map<String, JobState> jobs = new ConcurrentHashMap<>();
    private final ExecutorService workExecutor = Executors.newCachedThreadPool();
    private final ScheduledExecutorService tickerExecutor = Executors.newScheduledThreadPool(2);

    public TranscriptionJobService(AudioExtractionService audioExtractionService,
                                    GeminiTranscriptionService geminiTranscriptionService,
                                    WhisperTranscriptionService whisperTranscriptionService,
                                    SrtBuilderService srtBuilderService) {
        this.audioExtractionService = audioExtractionService;
        this.geminiTranscriptionService = geminiTranscriptionService;
        this.whisperTranscriptionService = whisperTranscriptionService;
        this.srtBuilderService = srtBuilderService;
    }

    private static final class JobState {
        volatile String status = "running";
        volatile String stage = "audio";
        volatile int progressPercent = 0;
        volatile TranscribeResponse result;
        volatile String error;
    }

    public String submit(Path sourcePath, int maxLines, int wordsPerLine, String translateTo,
                          Double expectedDurationSeconds) {
        String jobId = UUID.randomUUID().toString();
        JobState state = new JobState();
        jobs.put(jobId, state);
        workExecutor.submit(() -> run(jobId, state, sourcePath, maxLines, wordsPerLine, translateTo,
                expectedDurationSeconds));
        return jobId;
    }

    public TranscribeJobStatus status(String jobId) {
        JobState state = jobs.get(jobId);
        if (state == null) {
            return new TranscribeJobStatus("error", "unknown", 0, null, "Job topilmadi (eskirgan bo'lishi mumkin).");
        }
        TranscribeJobStatus view = new TranscribeJobStatus(
                state.status, state.stage, state.progressPercent, state.result, state.error);
        // Finished jobs are only meant to be fetched once — the panel already has the result by
        // the time it sees "done", and jobs never expire otherwise (this map is small/short-lived
        // in practice, but there's no reason to keep completed entries around indefinitely).
        if (!"running".equals(state.status)) {
            jobs.remove(jobId);
        }
        return view;
    }

    private void run(String jobId, JobState state, Path sourcePath, int maxLines, int wordsPerLine,
                      String translateTo, Double expectedDurationSeconds) {
        Path sessionDir = null;
        Path wavPath = null;
        ScheduledFuture<?> ticker = null;
        try {
            Path baseDir = Path.of(System.getProperty("java.io.tmpdir"), "uzbek-ai-captions");
            Files.createDirectories(baseDir);
            sessionDir = Files.createDirectory(baseDir.resolve(jobId));
            wavPath = sessionDir.resolve("audio.wav");

            state.stage = "audio";
            state.progressPercent = 5;
            audioExtractionService.extractAudio(sourcePath, wavPath);

            state.stage = "transcribing";
            state.progressPercent = 10;
            double audioSeconds = readWavDurationSeconds(wavPath);
            double estimatedSeconds = Math.max(5.0,
                    audioSeconds * ESTIMATED_SECONDS_PER_AUDIO_SECOND + ESTIMATED_FIXED_OVERHEAD_SECONDS);
            long startMs = System.currentTimeMillis();
            ticker = tickerExecutor.scheduleAtFixedRate(() -> {
                double elapsedSeconds = (System.currentTimeMillis() - startMs) / 1000.0;
                int estimated = 10 + (int) Math.min(79, (elapsedSeconds / estimatedSeconds) * 79);
                if (estimated > state.progressPercent) {
                    state.progressPercent = estimated;
                }
            }, 500, 500, TimeUnit.MILLISECONDS);

            TranscriptionResult result = transcribeWordAccurate(wavPath, translateTo);
            ticker.cancel(false);
            result = trimToExpectedDuration(result, expectedDurationSeconds);

            if (result.words().isEmpty() && result.segments().isEmpty()) {
                state.status = "error";
                state.error = "Nutq aniqlanmadi. Boshqa fayl bilan urinib ko'ring.";
                return;
            }

            state.stage = "building";
            state.progressPercent = 92;
            String srt = srtBuilderService.buildSrt(result, maxLines, wordsPerLine);
            Path srtPath = sessionDir.resolve("subtitle.srt");
            Files.writeString(srtPath, srt, StandardCharsets.UTF_8);

            state.result = new TranscribeResponse(srtPath.toString(), srt, result.segments(), result.words());
            state.stage = "done";
            state.progressPercent = 100;
            state.status = "done";
        } catch (IOException | RuntimeException e) {
            LOG.log(Level.WARNING, "Transcription job failed", e);
            state.status = "error";
            state.error = e.getMessage() != null ? e.getMessage() : "Noma'lum xatolik";
        } finally {
            if (ticker != null) {
                ticker.cancel(false);
            }
            if (wavPath != null) {
                try {
                    Files.deleteIfExists(wavPath);
                } catch (IOException ignored) {
                    // best-effort cleanup
                }
            }
        }
    }

    /**
     * Same reasoning as WhisperTranscriptionService/GeminiTranscriptionService: Whisper gives
     * frame-accurate real timestamps and is used whenever no translation is requested (Whisper's
     * own "translate" task only goes X-to-English). If the Whisper server is unreachable, falls
     * back to the Gemini-based translation proxy rather than failing the whole job.
     */
    private TranscriptionResult transcribeWordAccurate(Path wavPath, String translateTo) {
        if (translateTo != null && !translateTo.isBlank()) {
            return geminiTranscriptionService.transcribe(wavPath, translateTo);
        }
        try {
            return whisperTranscriptionService.transcribe(wavPath);
        } catch (RuntimeException e) {
            LOG.log(Level.WARNING, "Whisper transcription failed, falling back to Gemini", e);
            return geminiTranscriptionService.transcribe(wavPath, null);
        }
    }

    // Small buffer so a word/cue that legitimately starts right at the video's own end isn't
    // clipped by floating-point/frame-rounding differences between how the panel computed the
    // main video track's last clip end and how Whisper timestamped speech near it.
    private static final double DURATION_TRIM_TOLERANCE_SECONDS = 0.5;

    /**
     * The panel exports audio for the ENTIRE sequence (exportActiveSequenceAudio() in
     * host/index.jsx, workAreaType 0) rather than just the main video track's span — sequence
     * duration in Premiere is driven by the latest clip on ANY track, so leftover clips further
     * out on other tracks (e.g. from a previous "Subtitr yaratish"/B-roll/kinetic-text run, or
     * anything else placed past the main video) stretch the exported audio, and therefore the
     * generated SRT, past where the actual video ends — a customer reported exactly this
     * ("subtitr vaqtini sequence'dan ko'p qilib yuboradi"). expectedDurationSeconds (computed
     * client-side from the main video track's own last clip end — see host/index.jsx's
     * getMainVideoDurationSeconds()) lets this drop anything transcribed past that point instead
     * of changing the export itself, which would mean calling into untested Premiere in/out-point
     * scripting APIs.
     */
    private static TranscriptionResult trimToExpectedDuration(TranscriptionResult result, Double expectedDurationSeconds) {
        if (expectedDurationSeconds == null || expectedDurationSeconds <= 0) {
            return result;
        }
        double limit = expectedDurationSeconds + DURATION_TRIM_TOLERANCE_SECONDS;
        return new TranscriptionResult(
                result.words().stream().filter(w -> w.start() < limit).toList(),
                result.segments().stream().filter(s -> s.start() < limit).toList());
    }

    /** Reads a WAV file's duration straight from its header (sample count / sample rate) — used only to pace the progress estimate, not for correctness. Returns 0 on any parse failure. */
    private static double readWavDurationSeconds(Path wavPath) {
        try (RandomAccessFile raf = new RandomAccessFile(wavPath.toFile(), "r")) {
            byte[] header = new byte[44];
            if (raf.read(header) < 44) {
                return 0;
            }
            ByteBuffer buf = ByteBuffer.wrap(header).order(ByteOrder.LITTLE_ENDIAN);
            int channels = buf.getShort(22) & 0xFFFF;
            int sampleRate = buf.getInt(24);
            int bitsPerSample = buf.getShort(34) & 0xFFFF;
            double bytesPerSecond = sampleRate * channels * (bitsPerSample / 8.0);
            if (bytesPerSecond <= 0) {
                return 0;
            }
            long dataBytes = raf.length() - 44;
            return Math.max(0, dataBytes / bytesPerSecond);
        } catch (IOException e) {
            return 0;
        }
    }
}
