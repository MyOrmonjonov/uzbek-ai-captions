package org.example.plugin.web;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import org.example.plugin.config.KaraokeStylePresets;
import org.example.plugin.service.KaraokeCaptionService;
import org.example.plugin.service.LicenseService;
import org.example.plugin.web.dto.ErrorResponse;
import org.example.plugin.web.dto.KaraokeCaptionJobStatus;
import org.example.plugin.web.dto.KaraokeCaptionRequest;
import org.example.plugin.web.dto.KaraokeStyleDto;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/**
 * Karaoke-style burned-in caption export. Same background-job shape as TranscribeController:
 * POST starts the ffmpeg encode and returns immediately, GET polls it. Reuses the words[] the
 * panel already has from a prior "Subtitr yaratish" run rather than re-transcribing.
 */
@RestController
public class KaraokeCaptionController {

    private final KaraokeCaptionService captionService;
    private final LicenseService licenseService;

    public KaraokeCaptionController(KaraokeCaptionService captionService, LicenseService licenseService) {
        this.captionService = captionService;
        this.licenseService = licenseService;
    }

    @GetMapping("/api/karaoke-styles")
    public List<KaraokeStyleDto> styles() {
        return KaraokeStylePresets.all().stream()
                .map(s -> new KaraokeStyleDto(s.key(), s.displayName()))
                .toList();
    }

    @PostMapping("/api/karaoke-caption")
    public ResponseEntity<?> create(@RequestBody KaraokeCaptionRequest request) {
        LicenseService.Status license = licenseService.checkValid();
        if (!license.valid()) {
            return TranscribeController.licenseRequired(license);
        }

        if (request.videoPath() == null || request.videoPath().isBlank()) {
            return badRequest("videoPath talab qilinadi.");
        }
        if (!Files.isRegularFile(Path.of(request.videoPath()))) {
            return badRequest("Video fayl topilmadi: " + request.videoPath());
        }
        if (request.words() == null || request.words().isEmpty()) {
            return badRequest("words talab qilinadi (avval subtitr yaratilgan bo'lishi kerak).");
        }
        if (request.styleKey() == null || KaraokeStylePresets.byKey(request.styleKey()) == null) {
            return badRequest("Noma'lum stil: " + request.styleKey());
        }

        String jobId = captionService.submit(Path.of(request.videoPath()), request.words(), request.styleKey());
        return ResponseEntity.ok(new JobIdResponse(jobId));
    }

    @GetMapping("/api/karaoke-caption/status/{jobId}")
    public ResponseEntity<KaraokeCaptionJobStatus> status(@PathVariable String jobId) {
        return ResponseEntity.ok(captionService.status(jobId));
    }

    private record JobIdResponse(String jobId) {
    }

    private ResponseEntity<ErrorResponse> badRequest(String message) {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(new ErrorResponse(message));
    }
}
