package org.example.plugin.service;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import org.example.plugin.config.PluginProperties;
import org.example.plugin.model.BrollCandidate;
import org.example.plugin.model.BrollSuggestion;
import org.example.plugin.model.Segment;
import org.springframework.stereotype.Service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * Calls srt_bot's /broll-suggestions endpoint (Gemini scene grouping + Pexels/Giphy search, all
 * server-side) instead of doing that work directly from this machine — same reasoning as
 * GeminiTranscriptionService: keeps those three API keys off of every distributed plugin
 * install. The server returns the final candidate list directly (thumbnailUrl/mediaUrl are
 * public CDN links, no key needed to fetch them), so this replaces what used to be three
 * separate services (BrollSceneService + PexelsService + GiphyService) with one HTTP call.
 */
@Service
public class BrollSceneService {

    private final PluginProperties properties;
    private final DeviceIdentityService identityService;
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final HttpClient httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(15))
            .build();

    public BrollSceneService(PluginProperties properties, DeviceIdentityService identityService) {
        this.properties = properties;
        this.identityService = identityService;
    }

    public List<BrollSuggestion> fetchSuggestions(List<Segment> segments) {
        if (segments == null || segments.isEmpty()) {
            return List.of();
        }
        try {
            List<Map<String, Object>> segmentDicts = segments.stream()
                    .map(s -> Map.<String, Object>of("start", s.start(), "end", s.end(), "text", s.text()))
                    .toList();
            String body = objectMapper.writeValueAsString(Map.of("segments", segmentDicts));
            String token = identityService.loadSavedToken();

            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(properties.getBroll().getServerUrl()))
                    .timeout(Duration.ofMinutes(2))
                    .header("Content-Type", "application/json")
                    .header("X-Device-Code", identityService.getDeviceCode())
                    .header("X-License-Token", token != null ? token : "")
                    .POST(HttpRequest.BodyPublishers.ofString(body, StandardCharsets.UTF_8))
                    .build();

            HttpResponse<String> response = RetryableHttp.sendWithRetry(httpClient, request, 3);
            if (response.statusCode() != 200) {
                throw new BrollException("B-roll server xatoligi (" + response.statusCode() + "): " + response.body());
            }

            JsonNode root = objectMapper.readTree(response.body());
            List<BrollSuggestion> suggestions = new ArrayList<>();
            for (JsonNode node : root.path("suggestions")) {
                List<BrollCandidate> candidates = new ArrayList<>();
                for (JsonNode c : node.path("candidates")) {
                    candidates.add(new BrollCandidate(
                            c.path("type").asText(""), c.path("thumbnailUrl").asText(""), c.path("mediaUrl").asText("")));
                }
                if (candidates.isEmpty()) {
                    continue;
                }
                suggestions.add(new BrollSuggestion(
                        node.path("start").asDouble(), node.path("end").asDouble(),
                        node.path("keyword").asText(""), candidates));
            }
            return suggestions;
        } catch (IOException e) {
            throw new BrollException("B-roll serveriga ulanib bo'lmadi: " + e.getMessage(), e);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new BrollException("B-roll so'rovi to'xtatildi", e);
        }
    }

    public static class BrollException extends RuntimeException {
        public BrollException(String message) {
            super(message);
        }

        public BrollException(String message, Throwable cause) {
            super(message, cause);
        }
    }
}
