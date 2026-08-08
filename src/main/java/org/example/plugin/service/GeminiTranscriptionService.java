package org.example.plugin.service;

import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import org.example.plugin.config.PluginProperties;
import org.example.plugin.model.Segment;
import org.example.plugin.model.TranscriptionResult;
import org.example.plugin.model.Word;
import org.springframework.stereotype.Service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * Calls srt_bot's /transcribe-translate endpoint (Gemini, server-side) instead of the Gemini
 * API directly — the same reasoning as WhisperTranscriptionService: keeps the API key off of
 * every distributed plugin install (previously any user could pull it out of
 * application-local.properties and use it under this project's billing). Only reached when a
 * translation is requested; the plain (no-translation) path uses WhisperTranscriptionService for
 * frame-accurate timing instead.
 */
@Service
public class GeminiTranscriptionService {

    /** ISO code -> Uzbek phrase, shown in the panel's language picker / validated by TranscribeController. */
    public static final Map<String, String> TRANSLATION_LANGUAGES = Map.ofEntries(
            Map.entry("en", "ingliz"),
            Map.entry("ru", "rus"),
            Map.entry("tr", "turk"),
            Map.entry("kk", "qozoq"),
            Map.entry("ar", "arab"),
            Map.entry("zh", "xitoy"),
            Map.entry("fr", "fransuz"),
            Map.entry("de", "nemis")
    );

    private final PluginProperties properties;
    private final DeviceIdentityService identityService;
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final HttpClient httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(15))
            .build();

    public GeminiTranscriptionService(PluginProperties properties, DeviceIdentityService identityService) {
        this.properties = properties;
        this.identityService = identityService;
    }

    public TranscriptionResult transcribe(Path wavPath, String translateTo) {
        try {
            byte[] audioBytes = Files.readAllBytes(wavPath);
            String token = identityService.loadSavedToken();

            String url = properties.getTranslate().getServerUrl();
            if (translateTo != null && !translateTo.isBlank()) {
                url += "?translateTo=" + URLEncoder.encode(translateTo, StandardCharsets.UTF_8);
            }

            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(url))
                    .timeout(Duration.ofMinutes(3))
                    .header("Content-Type", "audio/wav")
                    .header("X-Device-Code", identityService.getDeviceCode())
                    .header("X-License-Token", token != null ? token : "")
                    .POST(HttpRequest.BodyPublishers.ofByteArray(audioBytes))
                    .build();

            HttpResponse<String> response = RetryableHttp.sendWithRetry(httpClient, request, 3);
            if (response.statusCode() != 200) {
                throw new GeminiException("Tarjima transkripsiyasi xatoligi (" + response.statusCode() + "): " + response.body());
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
            throw new GeminiException("Tarjima serveriga ulanib bo'lmadi: " + e.getMessage(), e);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new GeminiException("Tarjima so'rovi to'xtatildi", e);
        }
    }

    public static class GeminiException extends RuntimeException {
        public GeminiException(String message) {
            super(message);
        }

        public GeminiException(String message, Throwable cause) {
            super(message, cause);
        }
    }
}
