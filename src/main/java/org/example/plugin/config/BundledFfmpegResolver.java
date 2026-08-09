package org.example.plugin.config;

import java.io.File;
import java.nio.file.Files;
import java.nio.file.Path;

/**
 * jpackage-built installers (see .github/workflows/build-backend.yml) bundle their own ffmpeg
 * binary next to the native launcher — a sibling "ffmpeg" folder via {@code --app-content} on
 * Windows, or under "Contents/Resources/ffmpeg" on macOS (jpackage's mac --app-content lands
 * under Contents/, not next to the launcher binary in Contents/MacOS/) — so a customer never has
 * to install ffmpeg separately. The launcher's own path is read via {@link ProcessHandle}:
 * jpackage's native launcher execs the JVM inside the same OS process (no separate java/javaw
 * child process), so this reliably returns the launcher's own path. Running in dev (via
 * {@code mvn spring-boot:run} or plain {@code java -jar}) instead resolves to the java/javaw
 * binary, the sibling folders below won't exist there, and this correctly falls through to a
 * plain PATH lookup.
 */
final class BundledFfmpegResolver {

    private BundledFfmpegResolver() {
    }

    static String resolve(String configured) {
        if (!"ffmpeg".equals(configured)) {
            // Explicitly overridden (e.g. application-local.properties in dev) — respect as-is.
            return configured;
        }
        try {
            String launcherPath = ProcessHandle.current().info().command().orElse(null);
            if (launcherPath == null) {
                return configured;
            }
            Path launcherDir = Path.of(launcherPath).getParent();
            if (launcherDir == null) {
                return configured;
            }
            boolean windows = File.separatorChar == '\\';
            Path[] candidates = {
                    launcherDir.resolve("ffmpeg").resolve(windows ? "ffmpeg.exe" : "ffmpeg"),
                    launcherDir.resolveSibling("Resources").resolve("ffmpeg").resolve("ffmpeg"),
            };
            for (Path candidate : candidates) {
                if (Files.isRegularFile(candidate)) {
                    return candidate.toAbsolutePath().toString();
                }
            }
        } catch (RuntimeException e) {
            // Best-effort only; fall through to a plain PATH lookup below.
        }
        return configured;
    }
}