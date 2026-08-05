package org.example.plugin.service;

import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;

import org.example.plugin.config.PluginProperties;
import org.example.plugin.model.BrollCandidate;
import org.springframework.stereotype.Service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

/** Looks up b-roll GIFs for a keyword via the Giphy Search API. */
@Service
public class GiphyService {

    private static final String SEARCH_URL =
            "https://api.giphy.com/v1/gifs/search?api_key=%s&q=%s&limit=%d&rating=g";

    private final PluginProperties properties;
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final HttpClient httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(20))
            .build();

    public GiphyService(PluginProperties properties) {
        this.properties = properties;
    }

    public List<BrollCandidate> searchGifs(String keyword, int count) {
        String apiKey = properties.getGiphy().getApiKey();
        if (apiKey == null || apiKey.isBlank()) {
            return List.of();
        }
        try {
            String url = String.format(SEARCH_URL, apiKey, URLEncoder.encode(keyword, StandardCharsets.UTF_8), count);
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(url))
                    .timeout(Duration.ofSeconds(15))
                    .GET()
                    .build();

            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() != 200) {
                throw new GiphyException("Giphy API xatoligi (" + response.statusCode() + "): " + response.body());
            }

            JsonNode root = objectMapper.readTree(response.body());
            List<BrollCandidate> results = new ArrayList<>();
            for (JsonNode gif : root.path("data")) {
                JsonNode images = gif.path("images");
                String thumb = images.path("fixed_height_small").path("url").asText("");
                String full = images.path("original").path("url").asText("");
                if (full.isEmpty()) {
                    continue;
                }
                results.add(new BrollCandidate("gif", thumb.isEmpty() ? full : thumb, full));
            }
            return results;
        } catch (IOException e) {
            throw new GiphyException("Giphy'ga ulanib bo'lmadi: " + e.getMessage(), e);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new GiphyException("Giphy so'rovi to'xtatildi", e);
        }
    }

    public static class GiphyException extends RuntimeException {
        public GiphyException(String message) {
            super(message);
        }

        public GiphyException(String message, Throwable cause) {
            super(message, cause);
        }
    }
}