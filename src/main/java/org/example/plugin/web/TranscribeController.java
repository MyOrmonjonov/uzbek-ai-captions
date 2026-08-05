package org.example.plugin.web;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.UUID;
import java.util.logging.Level;
import java.util.logging.Logger;

import org.example.plugin.model.TranscriptionResult;
import org.example.plugin.service.AudioExtractionService;
import org.example.plugin.service.GeminiTranscriptionService;
import org.example.plugin.service.LicenseService;
import org.example.plugin.service.SrtBuilderService;
import org.example.plugin.service.WhisperTranscriptionService;
import org.example.plugin.web.dto.ErrorResponse;
import org.example.plugin.web.dto.TranscribeRequest;
import org.example.plugin.web.dto.TranscribeResponse;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class TranscribeController {

    private static final Logger LOG = Logger.getLogger(TranscribeController.class.getName());

    private static final int MIN_LINES = 1;
    private static final int MAX_LINES = 3;
    private static final int MIN_WORDS_PER_LINE = 1;
    private static final int MAX_WORDS_PER_LINE = 10;
    private static final int DEFAULT_MAX_LINES = 2;
    private static final int DEFAULT_WORDS_PER_LINE = 4;

    private final AudioExtractionService audioExtractionService;
    private final GeminiTranscriptionService geminiTranscriptionService;
    private final WhisperTranscriptionService whisperTranscriptionService;
    private final SrtBuilderService srtBuilderService;
    private final LicenseService licenseService;

    public TranscribeController(AudioExtractionService audioExtractionService,
                                 GeminiTranscriptionService geminiTranscriptionService,
                                 WhisperTranscriptionService whisperTranscriptionService,
                                 SrtBuilderService srtBuilderService,
                                 LicenseService licenseService) {
        this.audioExtractionService = audioExtractionService;
        this.geminiTranscriptionService = geminiTranscriptionService;
        this.whisperTranscriptionService = whisperTranscriptionService;
        this.srtBuilderService = srtBuilderService;
        this.licenseService = licenseService;
    }

    @PostMapping("/api/transcribe")
    public ResponseEntity<?> transcribe(@RequestBody TranscribeRequest request) {
        LicenseService.Status license = licenseService.checkValid();
        if (!license.valid()) {
            return licenseRequired(license);
        }

        if (request.filePath() == null || request.filePath().isBlank()) {
            return badRequest("filePath talab qilinadi.");
        }

        int maxLines = request.maxLines() != null ? request.maxLines() : DEFAULT_MAX_LINES;
        int wordsPerLine = request.wordsPerLine() != null ? request.wordsPerLine() : DEFAULT_WORDS_PER_LINE;
        if (maxLines < MIN_LINES || maxLines > MAX_LINES) {
            return badRequest("maxLines " + MIN_LINES + "-" + MAX_LINES + " oralig'ida bo'lishi kerak.");
        }
        if (wordsPerLine < MIN_WORDS_PER_LINE || wordsPerLine > MAX_WORDS_PER_LINE) {
            return badRequest("wordsPerLine " + MIN_WORDS_PER_LINE + "-" + MAX_WORDS_PER_LINE + " oralig'ida bo'lishi kerak.");
        }
        String translateTo = request.translateTo();
        if (translateTo != null && !translateTo.isBlank()
                && !GeminiTranscriptionService.TRANSLATION_LANGUAGES.containsKey(translateTo)) {
            return badRequest("translateTo noto'g'ri. Ruxsat etilgan qiymatlar: "
                    + GeminiTranscriptionService.TRANSLATION_LANGUAGES.keySet());
        }

        Path sourcePath = Path.of(request.filePath());
        if (!Files.isRegularFile(sourcePath)) {
            return badRequest("Fayl topilmadi: " + request.filePath());
        }

        Path sessionDir;
        try {
            Path baseDir = Path.of(System.getProperty("java.io.tmpdir"), "uzbek-ai-captions");
            Files.createDirectories(baseDir);
            sessionDir = Files.createDirectory(baseDir.resolve(UUID.randomUUID().toString()));
        } catch (IOException e) {
            return serverError("Vaqtinchalik papka yaratib bo'lmadi: " + e.getMessage());
        }

        Path wavPath = sessionDir.resolve("audio.wav");
        try {
            audioExtractionService.extractAudio(sourcePath, wavPath);

            TranscriptionResult result = transcribeWordAccurate(wavPath, translateTo);
            if (result.words().isEmpty() && result.segments().isEmpty()) {
                return badRequest("Nutq aniqlanmadi. Boshqa fayl bilan urinib ko'ring.");
            }

            String srt = srtBuilderService.buildSrt(result, maxLines, wordsPerLine);
            Path srtPath = sessionDir.resolve("subtitle.srt");
            Files.writeString(srtPath, srt, StandardCharsets.UTF_8);

            return ResponseEntity.ok(new TranscribeResponse(srtPath.toString(), srt, result.segments()));
        } catch (IOException | RuntimeException e) {
            return serverError(e.getMessage());
        } finally {
            try {
                Files.deleteIfExists(wavPath);
            } catch (IOException ignored) {
                // best-effort cleanup
            }
        }
    }

    /**
     * Whisper gives real, frame-accurate per-word timestamps and is used whenever no
     * translation is requested. Translation still needs Gemini (Whisper's built-in
     * "translate" task only goes X-to-English, not to our 8 target languages) — in that case
     * word timing falls back to Gemini's segment-estimate + interpolation, same as before.
     * If the Whisper server is unreachable, we fall back to Gemini too rather than failing
     * the whole generation outright.
     */
    private TranscriptionResult transcribeWordAccurate(Path wavPath, String translateTo) {
        if (translateTo != null && !translateTo.isBlank()) {
            return geminiTranscriptionService.transcribe(wavPath, translateTo);
        }
        try {
            return whisperTranscriptionService.transcribe(wavPath);
        } catch (RuntimeException e) {
            LOG.log(Level.WARNING, "Whisper transcription failed, falling back to Gemini", e);
            return geminiTranscriptionService.transcribe(wavPath, null);
        }
    }

    private ResponseEntity<ErrorResponse> badRequest(String message) {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(new ErrorResponse(message));
    }

    private ResponseEntity<ErrorResponse> serverError(String message) {
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(new ErrorResponse(message != null ? message : "Noma'lum xatolik"));
    }

    static ResponseEntity<ErrorResponse> licenseRequired(LicenseService.Status status) {
        String message = switch (status.reason()) {
            case "not_activated" -> "Plagin faollashtirilmagan. Panelda faollashtirish kodini oling.";
            case "expired" -> "Obuna muddati tugagan. Yangilash uchun botga yozing.";
            case "revoked" -> "Litsenziya bekor qilingan.";
            case "network_error" -> "Litsenziya serveriga ulanib bo'lmadi. Internetni tekshiring.";
            default -> "Litsenziya yaroqsiz.";
        };
        return ResponseEntity.status(HttpStatus.PAYMENT_REQUIRED).body(new ErrorResponse(message));
    }
}
