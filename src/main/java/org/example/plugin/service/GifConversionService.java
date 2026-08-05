package org.example.plugin.service;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.List;

import org.example.plugin.config.PluginProperties;
import org.springframework.stereotype.Service;

/**
 * Premiere Pro imports .gif as a single still frame, not an animated clip, so downloaded
 * GIF b-roll is transcoded to a short .mp4 before insertion.
 */
@Service
public class GifConversionService {

    private final PluginProperties properties;

    public GifConversionService(PluginProperties properties) {
        this.properties = properties;
    }

    public void convertToMp4(Path gifPath, Path mp4Path) {
        List<String> command = List.of(
                properties.getFfmpegPath(),
                "-y",
                "-i", gifPath.toString(),
                "-movflags", "faststart",
                "-pix_fmt", "yuv420p",
                "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2",
                mp4Path.toString()
        );
        try {
            Process process = new ProcessBuilder(command)
                    .redirectErrorStream(true)
                    .start();
            String output = new String(process.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
            int exitCode = process.waitFor();
            if (exitCode != 0) {
                throw new GifConversionException("ffmpeg gif->mp4 konvertatsiyasida xatolik:\n" + output);
            }
        } catch (IOException e) {
            throw new GifConversionException(
                    "ffmpeg ishga tushmadi. '" + properties.getFfmpegPath()
                            + "' PATH'da borligini tekshiring.", e);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new GifConversionException("ffmpeg jarayoni to'xtatildi", e);
        }
    }

    public static class GifConversionException extends RuntimeException {
        public GifConversionException(String message) {
            super(message);
        }

        public GifConversionException(String message, Throwable cause) {
            super(message, cause);
        }
    }
}