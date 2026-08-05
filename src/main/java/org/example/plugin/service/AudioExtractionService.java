package org.example.plugin.service;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.List;

import org.example.plugin.config.PluginProperties;
import org.springframework.stereotype.Service;

@Service
public class AudioExtractionService {

    private final PluginProperties properties;

    public AudioExtractionService(PluginProperties properties) {
        this.properties = properties;
    }

    /** Converts any input media file to mono 16kHz WAV, same as srt_bot/media.py's extract_audio. */
    public void extractAudio(Path inputPath, Path outputPath) {
        List<String> command = List.of(
                properties.getFfmpegPath(),
                "-y",
                "-i", inputPath.toString(),
                "-avoid_negative_ts", "make_zero",
                "-ac", "1",
                "-ar", "16000",
                "-vn",
                outputPath.toString()
        );
        try {
            Process process = new ProcessBuilder(command)
                    .redirectErrorStream(true)
                    .start();
            String output = new String(process.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
            int exitCode = process.waitFor();
            if (exitCode != 0) {
                throw new AudioExtractionException("ffmpeg audio ajratishda xatolik:\n" + output);
            }
        } catch (IOException e) {
            throw new AudioExtractionException(
                    "ffmpeg ishga tushmadi. '" + properties.getFfmpegPath()
                            + "' PATH'da borligini tekshiring.", e);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new AudioExtractionException("ffmpeg jarayoni to'xtatildi", e);
        }
    }

    public static class AudioExtractionException extends RuntimeException {
        public AudioExtractionException(String message) {
            super(message);
        }

        public AudioExtractionException(String message, Throwable cause) {
            super(message, cause);
        }
    }
}
