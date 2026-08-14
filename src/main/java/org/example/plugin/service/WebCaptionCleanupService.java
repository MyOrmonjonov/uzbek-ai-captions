package org.example.plugin.service;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;
import java.util.Comparator;
import java.util.logging.Level;
import java.util.logging.Logger;

import org.example.plugin.config.PluginProperties;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

/**
 * Sweeps disk (not just in-memory job state — see WebCaptionOrchestrationService.evictStaleJobs
 * for that) for the web caption tool. This is a NEW concern versus the desktop plugin: there,
 * temp files only ever accumulate on the user's own machine and are the user's problem; here
 * they'd otherwise accumulate forever on shared server disk, since:
 *   - java.io.tmpdir/ravon-web/ (this feature's own upload dirs + audio.wav temp files) is
 *     mostly self-cleaned by WebCaptionOrchestrationService, EXCEPT an upload a visitor never
 *     turns into a caption job (abandoned at the style-picker screen).
 *   - java.io.tmpdir/uzbek-ai-captions/ (KaraokeCaptionService's rendered output dirs, reused
 *     verbatim from the desktop plugin) is NEVER deleted on success by that class — it assumes
 *     "the user's own machine, their problem" and is left completely unmodified here, so this
 *     sweep is the only thing that will ever clean those up on the server.
 */
@Service
public class WebCaptionCleanupService {

    private static final Logger LOG = Logger.getLogger(WebCaptionCleanupService.class.getName());

    private final PluginProperties properties;

    public WebCaptionCleanupService(PluginProperties properties) {
        this.properties = properties;
    }

    @Scheduled(fixedRate = 900_000, initialDelay = 900_000)
    void sweep() {
        Duration retention = Duration.ofHours(properties.getWeb().getJobRetentionHours());
        String tmpDir = System.getProperty("java.io.tmpdir");
        sweepBaseDir(Path.of(tmpDir, "ravon-web"), retention);
        sweepBaseDir(Path.of(tmpDir, "uzbek-ai-captions"), retention);
    }

    private void sweepBaseDir(Path baseDir, Duration retention) {
        if (!Files.isDirectory(baseDir)) {
            return;
        }
        Instant cutoff = Instant.now().minus(retention);
        try (var entries = Files.list(baseDir)) {
            entries.forEach(entry -> {
                try {
                    if (Files.getLastModifiedTime(entry).toInstant().isBefore(cutoff)) {
                        deleteRecursively(entry);
                    }
                } catch (IOException | UncheckedIOException e) {
                    LOG.log(Level.FINE, "Could not evict " + entry, e);
                }
            });
        } catch (IOException e) {
            LOG.log(Level.WARNING, "Web caption cleanup sweep failed for " + baseDir, e);
        }
    }

    private static void deleteRecursively(Path path) {
        try (var stream = Files.walk(path)) {
            stream.sorted(Comparator.reverseOrder()).forEach(p -> {
                try {
                    Files.deleteIfExists(p);
                } catch (IOException ignored) {
                    // best-effort cleanup
                }
            });
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }
}
