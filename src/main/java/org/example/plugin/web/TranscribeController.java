package org.example.plugin.web;

import java.nio.file.Files;
import java.nio.file.Path;

import org.example.plugin.service.GeminiTranscriptionService;
import org.example.plugin.service.LicenseService;
import org.example.plugin.service.TranscriptionJobService;
import org.example.plugin.web.dto.ErrorResponse;
import org.example.plugin.web.dto.TranscribeJobStatus;
import org.example.plugin.web.dto.TranscribeRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/**
 * "Subtitr yaratish" now runs as a background job (see TranscriptionJobService) instead of one
 * long blocking request — POST starts the job and returns immediately, GET polls its progress.
 * Neither Whisper nor Gemini expose real fine-grained progress, so the panel gets a time-based
 * estimate during the "transcribing" stage rather than something truly instrumented; this still
 * turns one long static spinner into visible, moving progress, which was the actual ask.
 */
@RestController
public class TranscribeController {

    private static final int MIN_LINES = 1;
    private static final int MAX_LINES = 3;
    private static final int MIN_WORDS_PER_LINE = 1;
    private static final int MAX_WORDS_PER_LINE = 10;
    private static final int DEFAULT_MAX_LINES = 2;
    private static final int DEFAULT_WORDS_PER_LINE = 4;

    private final TranscriptionJobService jobService;
    private final LicenseService licenseService;

    public TranscribeController(TranscriptionJobService jobService, LicenseService licenseService) {
        this.jobService = jobService;
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

        String jobId = jobService.submit(sourcePath, maxLines, wordsPerLine, translateTo);
        return ResponseEntity.ok(new JobIdResponse(jobId));
    }

    @GetMapping("/api/transcribe/status/{jobId}")
    public ResponseEntity<TranscribeJobStatus> status(@PathVariable String jobId) {
        return ResponseEntity.ok(jobService.status(jobId));
    }

    private record JobIdResponse(String jobId) {
    }

    private ResponseEntity<ErrorResponse> badRequest(String message) {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(new ErrorResponse(message));
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
