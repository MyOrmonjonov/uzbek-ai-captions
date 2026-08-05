package org.example.plugin.service;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.Map;

import org.example.plugin.config.PluginProperties;
import org.example.plugin.model.Segment;
import org.example.plugin.model.TranscriptionResult;
import org.example.plugin.model.Word;
import org.springframework.stereotype.Service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

/** Port of srt_bot/gemini_transcriber.py, using inline base64 audio instead of the Files API. */
@Service
public class GeminiTranscriptionService {

    /** ISO code -> Uzbek phrase used to ask Gemini to translate into that language. */
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

    private static final String BASE_PROMPT = """
            Ushbu audioni so'zma-so'z transkripsiya qil.
            Nutq o'zbek tilida (lotin alifbosida yoz), ba'zi joylarda ingliz yoki rus so'zlari
            aralashgan bo'lishi mumkin — ularni eshitilgan holicha yoz.
            """;

    private static final String TRANSLATION_INSTRUCTION = """

            Har bir segmentni transkripsiya qilgandan so'ng, uni %s tiliga tarjima qil.
            "text" maydoniga FAQAT tarjima qilingan matnni yoz, original o'zbekcha matnni yozma.
            """;

    private static final String OUTPUT_INSTRUCTION = """

            Natijani FAQAT JSON massiv sifatida qaytar, boshqa hech qanday matn, izoh yoki
            markdown belgisi qo'shma:
            [{"start": 0.0, "end": 3.2, "text": "..."}, ...]

            Qoidalar:
            - Har bir segment tabiiy pauza bo'yicha bo'linsin, uzunligi taxminan 1-6 soniya.
            - "start" va "end" — audio boshidan soniyalarda hisoblangan aniq vaqt (raqam).
            - Faqat ANIQ eshitilgan nutqni yoz. Sukunat, fon shovqini yoki tushunarsiz
              joylarda hech narsa TO'QIMA — bunday joylarni massivga qo'shmasdan tashlab ket.
            - Nutq umuman bo'lmasa, bo'sh massiv [] qaytar.
            """;

    private static final Map<String, Object> RESPONSE_SCHEMA = Map.of(
            "type", "ARRAY",
            "items", Map.of(
                    "type", "OBJECT",
                    "properties", Map.of(
                            "start", Map.of("type", "NUMBER"),
                            "end", Map.of("type", "NUMBER"),
                            "text", Map.of("type", "STRING")
                    ),
                    "required", List.of("start", "end", "text")
            )
    );

    private final PluginProperties properties;
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final HttpClient httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(30))
            .build();

    public GeminiTranscriptionService(PluginProperties properties) {
        this.properties = properties;
    }

    public TranscriptionResult transcribe(Path wavPath, String translateTo) {
        try {
            String base64Audio = Base64.getEncoder().encodeToString(Files.readAllBytes(wavPath));
            String prompt = buildPrompt(translateTo);

            Map<String, Object> requestBody = Map.of(
                    "contents", List.of(Map.of(
                            "parts", List.of(
                                    Map.of("text", prompt),
                                    Map.of("inlineData", Map.of("mimeType", "audio/wav", "data", base64Audio))
                            )
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
                    .timeout(Duration.ofMinutes(3))
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(
                            objectMapper.writeValueAsString(requestBody), StandardCharsets.UTF_8))
                    .build();

            HttpResponse<String> response = RetryableHttp.sendWithRetry(httpClient, request, 3);
            if (response.statusCode() != 200) {
                throw new GeminiException("Gemini API xatoligi (" + response.statusCode() + "): " + response.body());
            }

            JsonNode root = objectMapper.readTree(response.body());
            String text = root.path("candidates").path(0).path("content").path("parts").path(0).path("text").asText();
            JsonNode cues = objectMapper.readTree(text);

            List<Word> words = new ArrayList<>();
            List<Segment> segments = new ArrayList<>();
            for (JsonNode cue : cues) {
                String cueText = cue.path("text").asText("").strip();
                if (cueText.isEmpty()) {
                    continue;
                }
                double start = cue.path("start").asDouble();
                double end = Math.max(cue.path("end").asDouble(), start);
                segments.add(new Segment(cueText, start, end));
                words.addAll(interpolateWords(cueText, start, end));
            }
            return new TranscriptionResult(words, segments);
        } catch (IOException e) {
            throw new GeminiException("Gemini so'roviga ulanib bo'lmadi: " + e.getMessage(), e);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new GeminiException("Gemini so'rovi to'xtatildi", e);
        }
    }

    private static String buildPrompt(String translateTo) {
        StringBuilder prompt = new StringBuilder(BASE_PROMPT);
        if (translateTo != null && !translateTo.isBlank()) {
            String languageName = TRANSLATION_LANGUAGES.get(translateTo);
            if (languageName != null) {
                prompt.append(String.format(TRANSLATION_INSTRUCTION, languageName + " tili"));
            }
        }
        prompt.append(OUTPUT_INSTRUCTION);
        return prompt.toString();
    }

    private static List<Word> interpolateWords(String text, double start, double end) {
        String[] tokens = text.split("\\s+");
        List<Word> words = new ArrayList<>();
        int totalLen = 0;
        for (String t : tokens) {
            totalLen += t.length();
        }
        if (totalLen == 0) {
            return words;
        }
        double duration = Math.max(end - start, 0.01);
        double cursor = start;
        for (String token : tokens) {
            double span = duration * ((double) token.length() / totalLen);
            double wStart = cursor;
            double wEnd = Math.min(end, cursor + span);
            words.add(new Word(token, wStart, Math.max(wEnd, wStart)));
            cursor = wEnd;
        }
        return words;
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
