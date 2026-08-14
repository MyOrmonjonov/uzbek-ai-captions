package org.example.plugin.service;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.logging.Level;
import java.util.logging.Logger;

import org.example.plugin.config.PluginProperties;
import org.example.plugin.model.TranscriptionResult;
import org.example.plugin.model.Word;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

/**
 * Runs the transcribe-only half of the web tool's pipeline (extract audio + Whisper), separate
 * from WebCaptionOrchestrationService's encode-only half. Split so the browser can show the
 * visitor an editable transcript (word click-to-seek, text edits, drag-to-retime) BEFORE any
 * style is picked or ffmpeg burn happens -- the source video is deliberately left untouched on
 * disk here (WebUploadStore.peek(), not take()) since the later /api/web/caption call still
 * needs it.
 */
@Service
public class WebTranscribeService {

    private static final Logger LOG = Logger.getLogger(WebTranscribeService.class.getName());

    public record Snapshot(String status, List<Word> words, String error) {
    }

    public static class ServerBusyException extends RuntimeException {
        public ServerBusyException(String message) {
            super(message);
        }
    }

    private static final class JobState {
        final long createdAtMillis = System.currentTimeMillis();
        volatile String status = "running";
        volatile List<Word> words;
        volatile String error;
    }

    private final PluginProperties properties;
    private final AudioExtractionService audioExtractionService;
    private final WhisperTranscriptionService whisperTranscriptionService;
    private final Map<String, JobState> jobs = new ConcurrentHashMap<>();
    private final ThreadPoolExecutor workExecutor;

    public WebTranscribeService(PluginProperties properties,
                                 AudioExtractionService audioExtractionService,
                                 WhisperTranscriptionService whisperTranscriptionService) {
        this.properties = properties;
        this.audioExtractionService = audioExtractionService;
        this.whisperTranscriptionService = whisperTranscriptionService;
        int maxConcurrent = Math.max(1, properties.getWeb().getMaxConcurrentJobs());
        this.workExecutor = new ThreadPoolExecutor(
                maxConcurrent, maxConcurrent, 0L, TimeUnit.MILLISECONDS,
                new LinkedBlockingQueue<>(Math.max(1, properties.getWeb().getQueueCapacity())));
    }

    /** @throws ServerBusyException if both the worker pool and its queue are already full. */
    public String submit(Path videoPath) {
        String jobId = UUID.randomUUID().toString();
        JobState state = new JobState();
        jobs.put(jobId, state);
        try {
            workExecutor.submit(() -> run(state, videoPath));
        } catch (RejectedExecutionException e) {
            jobs.remove(jobId);
            throw new ServerBusyException("Server hozircha band, birozdan keyin urinib ko'ring.");
        }
        return jobId;
    }

    public Snapshot status(String jobId) {
        JobState state = jobs.get(jobId);
        if (state == null) {
            return new Snapshot("error", null, "Job topilmadi (eskirgan bo'lishi mumkin).");
        }
        return new Snapshot(state.status, state.words, state.error);
    }

    private void run(JobState state, Path videoPath) {
        Path wavPath = null;
        try {
            Path baseDir = Path.of(System.getProperty("java.io.tmpdir"), "ravon-web");
            Files.createDirectories(baseDir);
            wavPath = Files.createTempFile(baseDir, "audio-", ".wav");
            audioExtractionService.extractAudio(videoPath, wavPath);

            TranscriptionResult result = whisperTranscriptionService.transcribe(wavPath);
            if (result.words().isEmpty()) {
                state.status = "error";
                state.error = "Nutq aniqlanmadi. Boshqa video bilan urinib ko'ring.";
                return;
            }
            state.words = result.words();
            state.status = "done";
        } catch (IOException | RuntimeException e) {
            LOG.log(Level.WARNING, "Web transcribe job failed", e);
            state.status = "error";
            state.error = e.getMessage() != null ? e.getMessage() : "Noma'lum xatolik";
        } finally {
            if (wavPath != null) {
                deleteQuietly(wavPath);
            }
        }
    }

    /** Prunes finished job entries older than the configured retention window (words[] is small, kept in memory only). */
    @Scheduled(fixedRate = 900_000)
    void evictStaleJobs() {
        long cutoff = System.currentTimeMillis()
                - Duration.ofHours(properties.getWeb().getJobRetentionHours()).toMillis();
        jobs.entrySet().removeIf(e -> !"running".equals(e.getValue().status) && e.getValue().createdAtMillis < cutoff);
    }

    private static void deleteQuietly(Path path) {
        try {
            Files.deleteIfExists(path);
        } catch (IOException ignored) {
            // best-effort cleanup
        }
    }
}
