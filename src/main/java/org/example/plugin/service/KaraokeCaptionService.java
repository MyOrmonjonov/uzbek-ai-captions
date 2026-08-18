package org.example.plugin.service;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.logging.Level;
import java.util.logging.Logger;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.example.plugin.config.KaraokeStylePresets;
import org.example.plugin.config.PluginProperties;
import org.example.plugin.model.KaraokeStyle;
import org.example.plugin.model.RenderOptions;
import org.example.plugin.model.Word;
import org.example.plugin.web.dto.KaraokeCaptionJobStatus;
import org.springframework.stereotype.Service;

/**
 * Burns karaoke-style animated captions into a video file, background-job style (same reasoning
 * and shape as TranscriptionJobService: a full re-encode is too long for one blocking request,
 * and there's no way to stream real progress out of ffmpeg's own output cheaply, so "encoding"
 * gets a time-based estimate the same way "transcribing" does there).
 *
 * Deliberately runs on THIS machine (the editor's own, via the ffmpeg already bundled with the
 * backend) rather than proxying to srt_bot's server the way Translate/Broll do — the video file
 * itself is the payload here, not just a short text prompt, so shipping it to a small shared VPS
 * would mean a slow upload/download round-trip and CPU-bound encode work landing on infrastructure
 * every customer shares, for no benefit (no secret API key needs hiding for a local ffmpeg run).
 */
@Service
public class KaraokeCaptionService {

    private static final Logger LOG = Logger.getLogger(KaraokeCaptionService.class.getName());
    private static final Pattern RESOLUTION_PATTERN =
            Pattern.compile("Video:.*?(\\d{2,5})x(\\d{2,5})");

    private final PluginProperties properties;
    private final Map<String, JobState> jobs = new ConcurrentHashMap<>();
    private final ExecutorService workExecutor = Executors.newCachedThreadPool();

    public KaraokeCaptionService(PluginProperties properties) {
        this.properties = properties;
    }

    private static final class JobState {
        volatile String status = "running";
        volatile String stage = "preparing";
        volatile int progressPercent = 0;
        volatile String outputPath;
        volatile String error;
    }

    /** Desktop CEP panel entry point -- always renders with the style's own hardcoded defaults. */
    public String submit(Path videoPath, List<Word> words, String styleKey) {
        return submit(videoPath, words, styleKey, null);
    }

    /** Web tool entry point -- options may be null (same defaults as above) or a RenderOptions customizing layout/text. */
    public String submit(Path videoPath, List<Word> words, String styleKey, RenderOptions options) {
        String jobId = UUID.randomUUID().toString();
        JobState state = new JobState();
        jobs.put(jobId, state);
        workExecutor.submit(() -> run(jobId, state, videoPath, words, styleKey, options));
        return jobId;
    }

    public KaraokeCaptionJobStatus status(String jobId) {
        JobState state = jobs.get(jobId);
        if (state == null) {
            return new KaraokeCaptionJobStatus("error", "unknown", 0, null,
                    "Job topilmadi (eskirgan bo'lishi mumkin).");
        }
        KaraokeCaptionJobStatus view = new KaraokeCaptionJobStatus(
                state.status, state.stage, state.progressPercent, state.outputPath, state.error);
        if (!"running".equals(state.status)) {
            jobs.remove(jobId);
        }
        return view;
    }

    private void run(String jobId, JobState state, Path videoPath, List<Word> words, String styleKey, RenderOptions options) {
        Path sessionDir = null;
        try {
            KaraokeStyle style = KaraokeStylePresets.byKey(styleKey);
            if (style == null) {
                state.status = "error";
                state.error = "Noma'lum stil: " + styleKey;
                return;
            }

            Path baseDir = Path.of(System.getProperty("java.io.tmpdir"), "uzbek-ai-captions");
            Files.createDirectories(baseDir);
            sessionDir = Files.createDirectory(baseDir.resolve(jobId));

            state.stage = "preparing";
            state.progressPercent = 5;
            int[] sourceResolution = detectResolution(videoPath);
            int[] outputResolution = resolveOutputResolution(sourceResolution, options);

            String ass = AssSubtitleBuilder.build(words, style, outputResolution[0], outputResolution[1], options);
            Path assPath = sessionDir.resolve("captions.ass");
            Files.writeString(assPath, ass, StandardCharsets.UTF_8);

            state.stage = "encoding";
            state.progressPercent = 15;
            Path outputPath = sessionDir.resolve("karaoke-" + style.key() + ".mp4");
            burnCaptions(videoPath, assPath, outputPath, sourceResolution, outputResolution);

            state.outputPath = outputPath.toString();
            state.stage = "done";
            state.progressPercent = 100;
            state.status = "done";
        } catch (IOException | RuntimeException e) {
            LOG.log(Level.WARNING, "Karaoke caption job failed", e);
            state.status = "error";
            state.error = e.getMessage() != null ? e.getMessage() : "Noma'lum xatolik";
            if (sessionDir != null) {
                deleteQuietly(sessionDir);
            }
        }
    }

    /**
     * ffprobe isn't bundled (only ffmpeg is — see BundledFfmpegResolver), so resolution comes
     * from parsing `ffmpeg -i <path>`'s own stderr stream description instead of a real probe.
     * That invocation always exits non-zero (no output was given), which is fine here — the
     * stream info line we want is printed before ffmpeg gives up, regardless of the exit code.
     */
    private int[] detectResolution(Path videoPath) {
        try {
            Process process = new ProcessBuilder(properties.getFfmpegPath(), "-i", videoPath.toString())
                    .redirectErrorStream(true)
                    .start();
            String output = new String(process.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
            process.waitFor();
            Matcher m = RESOLUTION_PATTERN.matcher(output);
            if (m.find()) {
                return new int[]{Integer.parseInt(m.group(1)), Integer.parseInt(m.group(2))};
            }
        } catch (IOException | InterruptedException e) {
            if (e instanceof InterruptedException) {
                Thread.currentThread().interrupt();
            }
            LOG.log(Level.FINE, "Could not detect video resolution, using default", e);
        }
        return new int[]{0, 0};
    }

    /**
     * Resolves options.targetResolution() (a desired output HEIGHT in pixels, e.g. "720") against
     * the source's actual dimensions, preserving its aspect ratio -- width and height are both
     * rounded up to even numbers (yuv420p requires it). Falls back to the source resolution
     * unchanged when targetResolution is absent, unparseable, or the source's own dimensions
     * couldn't be detected (nothing to compute an aspect ratio from).
     */
    private static int[] resolveOutputResolution(int[] source, RenderOptions options) {
        if (options == null || options.targetResolution() == null || source[0] <= 0 || source[1] <= 0) {
            return source;
        }
        int targetHeight;
        try {
            targetHeight = Integer.parseInt(options.targetResolution());
        } catch (NumberFormatException e) {
            return source;
        }
        if (targetHeight <= 0) {
            return source;
        }
        int width = (int) Math.round(source[0] * (targetHeight / (double) source[1]));
        return new int[]{width + (width % 2), targetHeight + (targetHeight % 2)};
    }

    private void burnCaptions(Path videoPath, Path assPath, Path outputPath, int[] sourceResolution, int[] outputResolution) throws IOException {
        // ASS paths go through libass's own mini-language where ':' and '\' are special, so on
        // Windows an absolute path like "C:\...\captions.ass" must be escaped before being
        // embedded in the -vf filtergraph string, not passed as a separate argument (ffmpeg's
        // filter option parsing, not shell quoting, is what needs this). Escaping alone was
        // verified NOT enough on its own -- ffmpeg's filtergraph parser still mis-split the
        // value at the drive-letter colon and dropped everything before it (confirmed by hand:
        // "ass=C\:\\Users\\..." failed, "ass='C\:\\Users\\...'" succeeded) -- the escaped path
        // additionally needs to be wrapped in single quotes.
        String escapedAssPath = assPath.toString().replace("\\", "\\\\").replace(":", "\\:");
        boolean needsScale = outputResolution[0] > 0
                && (outputResolution[0] != sourceResolution[0] || outputResolution[1] != sourceResolution[1]);
        // scale must come before ass in the filter chain -- the subtitle has to be drawn onto the
        // already-resized frame (its own PlayResX/PlayResY, from AssSubtitleBuilder, was computed
        // against outputResolution) rather than the source's original dimensions.
        String vf = (needsScale ? "scale=" + outputResolution[0] + ":" + outputResolution[1] + "," : "")
                + "ass='" + escapedAssPath + "'";
        List<String> command = List.of(
                properties.getFfmpegPath(),
                "-y",
                "-i", videoPath.toString(),
                "-vf", vf,
                "-c:a", "copy",
                // Without this, moov (the index a player needs before it can start decoding)
                // lands at the end of the file -- fine once fully downloaded, but breaks preview-
                // while-downloading in a browser. Free to add: just reorders atoms, no re-encode.
                "-movflags", "+faststart",
                outputPath.toString()
        );
        Process process = new ProcessBuilder(command).redirectErrorStream(true).start();
        String output;
        try {
            output = new String(process.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
            int exitCode = process.waitFor();
            if (exitCode != 0) {
                throw new KaraokeCaptionException("ffmpeg caption kuydirishda xatolik:\n" + output);
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new KaraokeCaptionException("ffmpeg jarayoni to'xtatildi", e);
        }
    }

    private static void deleteQuietly(Path dir) {
        try (var stream = Files.walk(dir)) {
            stream.sorted((a, b) -> b.compareTo(a)).forEach(p -> {
                try {
                    Files.deleteIfExists(p);
                } catch (IOException ignored) {
                    // best-effort cleanup
                }
            });
        } catch (IOException ignored) {
            // best-effort cleanup
        }
    }

    public static class KaraokeCaptionException extends RuntimeException {
        public KaraokeCaptionException(String message) {
            super(message);
        }

        public KaraokeCaptionException(String message, Throwable cause) {
            super(message, cause);
        }
    }
}
