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
import org.example.plugin.model.Word;
import org.example.plugin.web.dto.KaraokeCaptionJobStatus;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

/**
 * Orchestrates the web tool's caption-burn half of the pipeline: given a video already on disk
 * and a (possibly browser-edited) word list already produced by WebTranscribeService, drives
 * KaraokeCaptionService (already used by the CEP panel's karaoke export) and mirrors its
 * progress. Same background-job/poll shape as WebTranscribeService/TranscriptionJobService — a
 * jobId is handed back immediately, progress is polled.
 *
 * Audio-extraction and transcription used to happen here too, but moved to WebTranscribeService
 * so the browser can show an editable transcript BEFORE any style is picked or ffmpeg runs — see
 * that class's javadoc.
 *
 * Unlike KaraokeCaptionService/TranscriptionJobService, this does NOT evict its JobState the
 * first time a "done"/"error" status is fetched: the web flow needs a separate, later download
 * request against the same jobId (streaming bytes over HTTP, not just reporting a local path the
 * way the CEP panel does), so entries are only pruned by age via evictStaleJobs().
 */
@Service
public class WebCaptionOrchestrationService {

    private static final Logger LOG = Logger.getLogger(WebCaptionOrchestrationService.class.getName());

    public record Snapshot(String status, String stage, int progressPercent, String outputPath, String error) {
    }

    public static class ServerBusyException extends RuntimeException {
        public ServerBusyException(String message) {
            super(message);
        }
    }

    private static final class JobState {
        final long createdAtMillis = System.currentTimeMillis();
        volatile String status = "running";
        volatile String stage = "queued";
        volatile int progressPercent = 0;
        volatile String outputPath;
        volatile String error;
    }

    private final PluginProperties properties;
    private final KaraokeCaptionService karaokeCaptionService;
    private final Map<String, JobState> jobs = new ConcurrentHashMap<>();
    private final ThreadPoolExecutor workExecutor;

    public WebCaptionOrchestrationService(PluginProperties properties,
                                           KaraokeCaptionService karaokeCaptionService) {
        this.properties = properties;
        this.karaokeCaptionService = karaokeCaptionService;
        int maxConcurrent = Math.max(1, properties.getWeb().getMaxConcurrentJobs());
        this.workExecutor = new ThreadPoolExecutor(
                maxConcurrent, maxConcurrent, 0L, TimeUnit.MILLISECONDS,
                new LinkedBlockingQueue<>(Math.max(1, properties.getWeb().getQueueCapacity())));
    }

    /** @throws ServerBusyException if both the worker pool and its queue are already full. */
    public String submit(Path videoPath, String styleKey, List<Word> words) {
        String jobId = UUID.randomUUID().toString();
        JobState state = new JobState();
        jobs.put(jobId, state);
        try {
            workExecutor.submit(() -> run(state, videoPath, styleKey, words));
        } catch (RejectedExecutionException e) {
            jobs.remove(jobId);
            throw new ServerBusyException("Server hozircha band, birozdan keyin urinib ko'ring.");
        }
        return jobId;
    }

    public Snapshot status(String jobId) {
        JobState state = jobs.get(jobId);
        if (state == null) {
            return new Snapshot("error", "unknown", 0, null, "Job topilmadi (eskirgan bo'lishi mumkin).");
        }
        return new Snapshot(state.status, state.stage, state.progressPercent, state.outputPath, state.error);
    }

    private void run(JobState state, Path videoPath, String styleKey, List<Word> words) {
        try {
            state.stage = "encoding";
            state.progressPercent = 5;
            String innerJobId = karaokeCaptionService.submit(videoPath, words, styleKey);
            pollInnerJob(state, innerJobId);
        } catch (RuntimeException e) {
            LOG.log(Level.WARNING, "Web caption job failed", e);
            state.status = "error";
            state.error = e.getMessage() != null ? e.getMessage() : "Noma'lum xatolik";
        } finally {
            // This is now the last stage that still needs the uploaded source video —
            // WebTranscribeService.run() deliberately leaves it in place for this call.
            deleteQuietly(videoPath);
        }
    }

    private void pollInnerJob(JobState state, String innerJobId) {
        while (true) {
            KaraokeCaptionJobStatus inner = karaokeCaptionService.status(innerJobId);
            if ("running".equals(inner.status())) {
                state.progressPercent = 5 + (int) Math.min(94, inner.progressPercent() * 0.95);
                sleepQuietly(600);
                continue;
            }
            if ("done".equals(inner.status())) {
                state.outputPath = inner.outputPath();
                state.stage = "done";
                state.progressPercent = 100;
                state.status = "done";
            } else {
                state.status = "error";
                state.error = inner.error() != null ? inner.error() : "Kuydirishda xatolik";
            }
            return;
        }
    }

    /** Prunes finished job entries older than the configured retention window (not disk files — see WebCaptionCleanupService for that). */
    @Scheduled(fixedRate = 900_000)
    void evictStaleJobs() {
        long cutoff = System.currentTimeMillis()
                - Duration.ofHours(properties.getWeb().getJobRetentionHours()).toMillis();
        jobs.entrySet().removeIf(e -> !"running".equals(e.getValue().status) && e.getValue().createdAtMillis < cutoff);
    }

    private static void sleepQuietly(long millis) {
        try {
            Thread.sleep(millis);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    private static void deleteQuietly(Path path) {
        try {
            Files.deleteIfExists(path);
        } catch (IOException ignored) {
            // best-effort cleanup
        }
    }
}
