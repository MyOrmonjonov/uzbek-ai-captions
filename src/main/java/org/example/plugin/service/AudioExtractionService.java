package org.example.plugin.service;

import java.io.IOException;
import java.io.RandomAccessFile;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.List;
import java.util.logging.Level;
import java.util.logging.Logger;

import org.example.plugin.config.PluginProperties;
import org.springframework.stereotype.Service;

@Service
public class AudioExtractionService {

    private static final Logger LOG = Logger.getLogger(AudioExtractionService.class.getName());

    private final PluginProperties properties;

    public AudioExtractionService(PluginProperties properties) {
        this.properties = properties;
    }

    /**
     * Converts any input media file to mono 16kHz WAV, same as srt_bot/media.py's extract_audio.
     * The CEP panel's Premiere path already exports audio directly via Premiere's own
     * exportAsMediaDirect() with a mono-16kHz .epr preset (see host/index.jsx's
     * exportActiveSequenceAudio()) — so on every "Subtitr yaratish" request from a Premiere
     * user, the input here is typically ALREADY in the exact target format, and this was
     * unconditionally re-encoding it through ffmpeg anyway. That made local ffmpeg a hard
     * dependency for the single most common request path, not just for raw video / After
     * Effects input (AE's render-queue export doesn't guarantee mono/16kHz, so still needs
     * this). A customer hit an ffmpeg-not-found error that broke subtitle generation entirely;
     * skipping the redundant re-encode when the input already matches removes that dependency
     * from the dominant case, without changing behavior for anything that still needs it.
     */
    public void extractAudio(Path inputPath, Path outputPath) {
        if (isAlreadyMono16kPcmWav(inputPath)) {
            try {
                Files.copy(inputPath, outputPath, StandardCopyOption.REPLACE_EXISTING);
                LOG.fine("Input already mono/16kHz WAV, skipped ffmpeg: " + inputPath);
                return;
            } catch (IOException e) {
                LOG.log(Level.FINE, "Fast-path copy failed, falling back to ffmpeg", e);
                // fall through to the ffmpeg path below
            }
        }

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

    /** Same 44-byte canonical WAV header this class's caller already parses for duration. */
    private static boolean isAlreadyMono16kPcmWav(Path path) {
        try (RandomAccessFile raf = new RandomAccessFile(path.toFile(), "r")) {
            byte[] header = new byte[44];
            if (raf.read(header) < 44) {
                return false;
            }
            String riff = new String(header, 0, 4, StandardCharsets.US_ASCII);
            String wave = new String(header, 8, 4, StandardCharsets.US_ASCII);
            String fmt = new String(header, 12, 4, StandardCharsets.US_ASCII);
            if (!"RIFF".equals(riff) || !"WAVE".equals(wave) || !"fmt ".equals(fmt)) {
                return false;
            }
            ByteBuffer buf = ByteBuffer.wrap(header).order(ByteOrder.LITTLE_ENDIAN);
            int audioFormat = buf.getShort(20) & 0xFFFF;
            int channels = buf.getShort(22) & 0xFFFF;
            int sampleRate = buf.getInt(24);
            return audioFormat == 1 && channels == 1 && sampleRate == 16000;
        } catch (IOException e) {
            return false;
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
