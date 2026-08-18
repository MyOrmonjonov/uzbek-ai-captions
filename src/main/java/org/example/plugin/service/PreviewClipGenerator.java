package org.example.plugin.service;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import org.example.plugin.config.KaraokeStylePresets;
import org.example.plugin.model.KaraokeStyle;
import org.example.plugin.model.RenderOptions;
import org.example.plugin.model.Word;

/** One-off dev tool: regenerates the gallery preview clip for a given style key, over the same
 * fixed sample phrase and solid-navy background every other karaoke-previews/*.mp4 already uses.
 * Not part of the shipped app -- run manually via `java -cp target/classes ... <ffmpegPath> <key>
 * [<key> ...]`, then copy the output(s) into cep-extension/client/assets/karaoke-previews/ and
 * website/assets/karaoke-previews/. */
final class PreviewClipGenerator {

    private static final List<Word> SAMPLE_WORDS = List.of(
            new Word("Salom", 0.0, 0.45),
            new Word("dunyo", 0.5, 0.95),
            new Word("bu", 1.0, 1.2),
            new Word("ravon", 1.3, 1.75),
            new Word("caption", 1.8, 2.35));
    private static final int WIDTH = 720;
    private static final int HEIGHT = 1280;
    private static final double DURATION = 2.4;
    private static final String BACKGROUND_HEX = "1c1836"; // matches website's --bg-elev-2
    // wordsPerLine=3 (not the 5-word default) matches every existing karaoke-previews/*.mp4's
    // two-line "Salom dunyo bu / ravon caption" wrap.
    private static final RenderOptions PREVIEW_OPTIONS =
            new RenderOptions(5, 3, 100, "bottom", false, null, "custom", false, false, null, null, true, null);

    private PreviewClipGenerator() {
    }

    public static void main(String[] args) throws IOException, InterruptedException {
        if (args.length < 2) {
            System.err.println("Usage: PreviewClipGenerator <ffmpegPath> <styleKey> [<styleKey> ...]");
            System.exit(1);
        }
        String ffmpegPath = args[0];
        Path outDir = Path.of("preview-out");
        Files.createDirectories(outDir);

        for (int i = 1; i < args.length; i++) {
            String key = args[i];
            KaraokeStyle style = KaraokeStylePresets.byKey(key);
            if (style == null) {
                System.err.println("Unknown style key: " + key);
                continue;
            }
            String ass = AssSubtitleBuilder.build(SAMPLE_WORDS, style, WIDTH, HEIGHT, PREVIEW_OPTIONS);
            Path assPath = outDir.resolve(key + ".ass");
            Files.writeString(assPath, ass, StandardCharsets.UTF_8);

            Path outPath = outDir.resolve(key + ".mp4");
            String escapedAssPath = assPath.toAbsolutePath().toString().replace("\\", "\\\\").replace(":", "\\:");
            List<String> command = List.of(
                    ffmpegPath, "-y",
                    "-f", "lavfi", "-i", "color=c=0x" + BACKGROUND_HEX + ":s=" + WIDTH + "x" + HEIGHT + ":d=" + DURATION + ":r=30",
                    "-vf", "ass='" + escapedAssPath + "'",
                    "-c:v", "libx264", "-pix_fmt", "yuv420p",
                    // moov (the atom a <video> element needs before it can determine
                    // duration/start decoding) otherwise lands at the END of the file -- fine
                    // for a full download, but a browser's initial Range request only sees mdat
                    // and the video sits stuck at readyState 0 forever. +faststart moves moov to
                    // the front.
                    "-movflags", "+faststart",
                    outPath.toAbsolutePath().toString());
            Process process = new ProcessBuilder(command).redirectErrorStream(true).start();
            String output = new String(process.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
            int exitCode = process.waitFor();
            if (exitCode != 0) {
                System.err.println("ffmpeg failed for " + key + ":\n" + output);
            } else {
                System.out.println("Generated " + outPath.toAbsolutePath());
            }
        }
    }
}
