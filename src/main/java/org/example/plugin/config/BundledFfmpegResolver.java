package org.example.plugin.config;

import java.io.File;
import java.net.URISyntaxException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.logging.Level;
import java.util.logging.Logger;

/**
 * jpackage-built installers (see .github/workflows/build-backend.yml) bundle their own ffmpeg
 * binary in the app image via {@code --app-content} — a sibling "ffmpeg" folder next to the app
 * root on Windows ({@code <AppName>/ffmpeg/ffmpeg.exe}, sibling of {@code <AppName>.exe} and of
 * the {@code app/} and {@code runtime/} folders), or under "Contents/Resources/ffmpeg" on macOS
 * — so a customer never has to install ffmpeg separately.
 *
 * <p>The app root is located from this class's own jar location ({@code app/<jar>.jar}'s
 * grandparent directory) rather than solely from {@link ProcessHandle}. jpackage's native
 * launcher is expected to exec the JVM in-process on Windows, so {@code ProcessHandle.current()}
 * should normally also point at the launcher — but that's an assumption about jpackage/JDK
 * internals this project can't fully verify against every real install, whereas the running
 * class's own jar location is always exactly where it physically sits on disk. Both are tried;
 * whichever candidate set actually contains a real ffmpeg binary wins. Running in dev (via
 * {@code mvn spring-boot:run} or plain {@code java -jar}) resolves to a location with no such
 * sibling "ffmpeg" folder, so this correctly falls through to a plain PATH lookup there.
 */
final class BundledFfmpegResolver {

    private static final Logger LOG = Logger.getLogger(BundledFfmpegResolver.class.getName());

    private BundledFfmpegResolver() {
    }

    static String resolve(String configured) {
        if (!"ffmpeg".equals(configured)) {
            // Explicitly overridden (e.g. application-local.properties in dev) — respect as-is.
            return configured;
        }
        boolean windows = File.separatorChar == '\\';
        String exeName = windows ? "ffmpeg.exe" : "ffmpeg";
        Set<Path> appRoots = new LinkedHashSet<>();

        try {
            Path jarLocation = Path.of(BundledFfmpegResolver.class.getProtectionDomain()
                    .getCodeSource().getLocation().toURI());
            // .../<AppName>/app/Plugin-....jar -> .../<AppName>/app -> .../<AppName>
            Path appDir = jarLocation.getParent();
            if (appDir != null && appDir.getParent() != null) {
                appRoots.add(appDir.getParent());
            }
        } catch (URISyntaxException | RuntimeException e) {
            LOG.log(Level.FINE, "Could not derive app root from jar location", e);
        }

        try {
            String launcherPath = ProcessHandle.current().info().command().orElse(null);
            if (launcherPath != null) {
                Path launcherDir = Path.of(launcherPath).getParent();
                if (launcherDir != null) {
                    appRoots.add(launcherDir);
                    // In case ProcessHandle reflects a runtime/bin/java(w).exe child process
                    // rather than the top-level launcher (see class comment above).
                    if (launcherDir.getParent() != null && launcherDir.getParent().getParent() != null) {
                        appRoots.add(launcherDir.getParent().getParent());
                    }
                }
            }
        } catch (RuntimeException e) {
            LOG.log(Level.FINE, "Could not derive app root from ProcessHandle", e);
        }

        List<Path> tried = new ArrayList<>();
        for (Path root : appRoots) {
            Path[] candidates = {
                    root.resolve("ffmpeg").resolve(exeName),
                    root.resolve("Resources").resolve("ffmpeg").resolve(exeName),
                    // jpackage's --app-content <dir> copies <dir> itself into the app image root
                    // (not just its contents) -- the build workflow stages the ffmpeg binary
                    // under a local "app-content" folder, so it lands at
                    // <root>/app-content/ffmpeg/<exe> on Windows and
                    // <root>/app-content/Resources/ffmpeg/<exe> on macOS, one level deeper than
                    // the two candidates above assumed. Confirmed against a real installed app
                    // image after "Premiere works, After Effects can't find ffmpeg" turned out to
                    // be this path mismatch (AE's export doesn't hit the mono/16kHz fast-path in
                    // AudioExtractionService, so it's the one host that actually needs this).
                    root.resolve("app-content").resolve("ffmpeg").resolve(exeName),
                    root.resolve("app-content").resolve("Resources").resolve("ffmpeg").resolve(exeName),
            };
            for (Path candidate : candidates) {
                tried.add(candidate);
                if (Files.isRegularFile(candidate)) {
                    LOG.info("Using bundled ffmpeg at " + candidate.toAbsolutePath());
                    return candidate.toAbsolutePath().toString();
                }
            }
        }

        LOG.warning("No bundled ffmpeg found, falling back to PATH lookup of 'ffmpeg'. Tried: " + tried);
        return configured;
    }
}