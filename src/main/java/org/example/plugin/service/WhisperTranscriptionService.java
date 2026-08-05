package org.example.plugin.service;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;

import org.example.plugin.config.PluginProperties;
import org.example.plugin.model.Segment;
import org.example.plugin.model.TranscriptionResult;
import org.example.plugin.model.Word;
import org.springframework.stereotype.Service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * Calls srt_bot's /transcribe endpoint (faster-whisper) for frame-accurate, real
 * per-word timestamps — unlike Gemini, which estimates segment timing via an LLM and then
 * approximates word positions within each segment by character length. Used whenever no
 * translation is requested; translation still goes through Gemini (see TranscribeController)
 * since Whisper's built-in "translate" task only supports X-to-English.
 */
@Service
public class WhisperTranscriptionService {

    private final PluginProperties properties;
    private final DeviceIdentityService identityService;
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final HttpClient httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(15))
            .build();

    public WhisperTranscriptionService(PluginProperties properties, DeviceIdentityService identityService) {
        this.properties = properties;
        this.identityService = identityService;
    }

    public TranscriptionResult transcribe(Path wavPath) {
        try {
            byte[] audioBytes = Files.readAllBytes(wavPath);
            String token = identityService.loadSavedToken();

            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(properties.getWhisper().getServerUrl()))
                    .timeout(Duration.ofMinutes(5))
                    .header("Content-Type", "audio/wav")
                    .header("X-Device-Code", identityService.getDeviceCode())
                    .header("X-License-Token", token != null ? token : "")
                    .POST(HttpRequest.BodyPublishers.ofByteArray(audioBytes))
                    .build();

            HttpResponse<String> response = RetryableHttp.sendWithRetry(httpClient, request, 3);
            if (response.statusCode() != 200) {
                throw new WhisperException("Whisper API xatoligi (" + response.statusCode() + "): " + response.body());
            }

            JsonNode root = objectMapper.readTree(response.body());
            List<Word> words = new ArrayList<>();
            for (JsonNode w : root.path("words")) {
                words.add(new Word(w.path("text").asText(""), w.path("start").asDouble(), w.path("end").asDouble()));
            }
            List<Segment> segments = new ArrayList<>();
            for (JsonNode s : root.path("segments")) {
                segments.add(new Segment(s.path("text").asText(""), s.path("start").asDouble(), s.path("end").asDouble()));
            }
            return new TranscriptionResult(words, segments);
        } catch (IOException e) {
            throw new WhisperException("Whisper serveriga ulanib bo'lmadi: " + e.getMessage(), e);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new WhisperException("Whisper so'rovi to'xtatildi", e);
        }
    }

    public static class WhisperException extends RuntimeException {
        public WhisperException(String message) {
            super(message);
        }

        public WhisperException(String message, Throwable cause) {
            super(message, cause);
        }
    }
}