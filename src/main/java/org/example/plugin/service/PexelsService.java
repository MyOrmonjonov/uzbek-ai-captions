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

/** Looks up stock b-roll videos and photos for a keyword via the Pexels APIs. */
@Service
public class PexelsService {

    private static final String VIDEO_SEARCH_URL =
            "https://api.pexels.com/videos/search?query=%s&per_page=%d&orientation=landscape";
    private static final String PHOTO_SEARCH_URL =
            "https://api.pexels.com/v1/search?query=%s&per_page=%d&orientation=landscape";

    private final PluginProperties properties;
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final HttpClient httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(30))
            .build();

    public PexelsService(PluginProperties properties) {
        this.properties = properties;
    }

    public List<BrollCandidate> searchVideos(String keyword, int count) {
        try {
            String url = String.format(VIDEO_SEARCH_URL, URLEncoder.encode(keyword, StandardCharsets.UTF_8), count);
            JsonNode root = get(url);
            List<BrollCandidate> results = new ArrayList<>();
            for (JsonNode video : root.path("videos")) {
                JsonNode chosen = pickFile(video.path("video_files"));
                if (chosen == null) {
                    continue;
                }
                results.add(new BrollCandidate("video", video.path("image").asText(""), chosen.path("link").asText("")));
            }
            return results;
        } catch (IOException e) {
            throw new PexelsException("Pexels'ga ulanib bo'lmadi: " + e.getMessage(), e);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new PexelsException("Pexels so'rovi to'xtatildi", e);
        }
    }

    public List<BrollCandidate> searchPhotos(String keyword, int count) {
        try {
            String url = String.format(PHOTO_SEARCH_URL, URLEncoder.encode(keyword, StandardCharsets.UTF_8), count);
            JsonNode root = get(url);
            List<BrollCandidate> results = new ArrayList<>();
            for (JsonNode photo : root.path("photos")) {
                String thumb = photo.path("src").path("medium").asText("");
                String full = photo.path("src").path("large").asText("");
                if (full.isEmpty()) {
                    continue;
                }
                results.add(new BrollCandidate("photo", thumb, full));
            }
            return results;
        } catch (IOException e) {
            throw new PexelsException("Pexels'ga ulanib bo'lmadi: " + e.getMessage(), e);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new PexelsException("Pexels so'rovi to'xtatildi", e);
        }
    }

    private JsonNode get(String url) throws IOException, InterruptedException {
        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(url))
                .timeout(Duration.ofSeconds(20))
                .header("Authorization", properties.getPexels().getApiKey())
                .GET()
                .build();

        HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() != 200) {
            throw new PexelsException("Pexels API xatoligi (" + response.statusCode() + "): " + response.body());
        }
        return objectMapper.readTree(response.body());
    }

    /** Prefers a compact "sd" file (~960px wide); falls back to the narrowest file available. */
    private static JsonNode pickFile(JsonNode files) {
        if (!files.isArray() || files.isEmpty()) {
            return null;
        }
        JsonNode bestSd = null;
        JsonNode narrowest = null;
        for (JsonNode file : files) {
            int width = file.path("width").asInt(Integer.MAX_VALUE);
            if (narrowest == null || width < narrowest.path("width").asInt(Integer.MAX_VALUE)) {
                narrowest = file;
            }
            if ("sd".equals(file.path("quality").asText())
                    && (bestSd == null || width > bestSd.path("width").asInt(0)) && width <= 960) {
                bestSd = file;
            }
        }
        return bestSd != null ? bestSd : narrowest;
    }

    public static class PexelsException extends RuntimeException {
        public PexelsException(String message) {
            super(message);
        }

        public PexelsException(String message, Throwable cause) {
            super(message, cause);
        }
    }
}
