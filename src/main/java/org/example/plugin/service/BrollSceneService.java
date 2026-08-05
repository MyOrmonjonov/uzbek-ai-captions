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
import java.util.stream.Collectors;

import org.example.plugin.config.PluginProperties;
import org.example.plugin.model.BrollScene;
import org.example.plugin.model.Segment;
import org.springframework.stereotype.Service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * Groups a transcript's segments into a handful of scenes and asks Gemini for a short
 * English stock-footage search keyword per scene, so b-roll can be sourced from Pexels.
 */
@Service
public class BrollSceneService {

    private static final int MAX_SCENES = 8;

    private static final String PROMPT_TEMPLATE = """
            Quyida video subtitrining segmentlari (vaqt va matn) berilgan, o'zbek tilida.
            Vazifang: butun videoni ketma-ket, bir-biriga ustma-ust tushmaydigan
            eng ko'pi bilan %d ta "sahna"ga bo'lish va har bir sahna uchun shu qism
            qanday mavzuda ekanini tasvirlaydigan, stock-video qidiruvi uchun mos
            2-3 so'zli INGLIZCHA kalit so'z (keyword) topish.

            Qoidalar:
            - Sahnalar birinchi segment boshidan oxirgi segment oxirigacha bo'lgan
              butun davrni qamrab olsin, oraliqlarda bo'shliq yoki ustma-ustlik bo'lmasin.
            - keyword umumiy, vizual jihatdan qidirsa bo'ladigan narsa bo'lsin
              (masalan "city traffic", "ocean waves", "person typing laptop"),
              shaxsiy ism yoki mavhum tushunchalar emas.
            - Natijani FAQAT JSON massiv sifatida qaytar, boshqa matn yoki izohsiz:
              [{"start": 0.0, "end": 12.5, "keyword": "..."}, ...]

            Segmentlar:
            %s
            """;

    private static final Map<String, Object> RESPONSE_SCHEMA = Map.of(
            "type", "ARRAY",
            "items", Map.of(
                    "type", "OBJECT",
                    "properties", Map.of(
                            "start", Map.of("type", "NUMBER"),
                            "end", Map.of("type", "NUMBER"),
                            "keyword", Map.of("type", "STRING")
                    ),
                    "required", List.of("start", "end", "keyword")
            )
    );

    private final PluginProperties properties;
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final HttpClient httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(30))
            .build();

    public BrollSceneService(PluginProperties properties) {
        this.properties = properties;
    }

    public List<BrollScene> groupIntoScenes(List<Segment> segments) {
        if (segments == null || segments.isEmpty()) {
            return List.of();
        }

        String segmentList = segments.stream()
                .map(s -> String.format("%.1f-%.1f: %s", s.start(), s.end(), s.text()))
                .collect(Collectors.joining("\n"));
        String prompt = String.format(PROMPT_TEMPLATE, MAX_SCENES, segmentList);

        try {
            Map<String, Object> requestBody = Map.of(
                    "contents", List.of(Map.of(
                            "parts", List.of(Map.of("text", prompt))
                    )),
                    "generationConfig", Map.of(
                            "temperature", 0,
                            "responseMimeType", "application/json",
                            "responseSchema", RESPONSE_SCHEMA
                    )
            );

            String url = "https://generativelanguage.googleapis.com/v1beta/models/"
                    + properties.getGemini().getModel() + ":generateContent?key="
                    + properties.getGemini().getApiKey();

            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(url))
                    .timeout(Duration.ofMinutes(2))
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(
                            objectMapper.writeValueAsString(requestBody), StandardCharsets.UTF_8))
                    .build();

            HttpResponse<String> response = RetryableHttp.sendWithRetry(httpClient, request, 3);
            if (response.statusCode() != 200) {
                throw new BrollException("Gemini API xatoligi (" + response.statusCode() + "): " + response.body());
            }

            JsonNode root = objectMapper.readTree(response.body());
            String text = root.path("candidates").path(0).path("content").path("parts").path(0).path("text").asText();
            JsonNode scenesJson = objectMapper.readTree(text);

            List<BrollScene> scenes = new ArrayList<>();
            for (JsonNode node : scenesJson) {
                String keyword = node.path("keyword").asText("").strip();
                if (keyword.isEmpty()) {
                    continue;
                }
                double start = node.path("start").asDouble();
                double end = Math.max(node.path("end").asDouble(), start);
                scenes.add(new BrollScene(start, end, keyword));
            }
            return scenes;
        } catch (IOException e) {
            throw new BrollException("Gemini so'roviga ulanib bo'lmadi: " + e.getMessage(), e);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new BrollException("Gemini so'rovi to'xtatildi", e);
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
