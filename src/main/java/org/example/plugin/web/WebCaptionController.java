package org.example.plugin.web;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.UUID;

import org.example.plugin.config.KaraokeStylePresets;
import org.example.plugin.model.Word;
import org.example.plugin.service.WebCaptionOrchestrationService;
import org.example.plugin.service.WebCaptionOrchestrationService.ServerBusyException;
import org.example.plugin.service.WebQuotaService;
import org.example.plugin.service.WebTranscribeService;
import org.example.plugin.service.WebUploadStore;
import org.example.plugin.web.dto.ErrorResponse;
import org.example.plugin.web.dto.QuotaExceededResponse;
import org.example.plugin.web.dto.WebCaptionJobStatus;
import org.example.plugin.web.dto.WebCaptionRequest;
import org.example.plugin.web.dto.WebTranscribeJobStatus;
import org.example.plugin.web.dto.WebTranscribeRequest;
import org.springframework.core.io.FileSystemResource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import jakarta.servlet.http.HttpServletRequest;

/**
 * Browser-facing endpoints for the web caption tool (website/subtitr.html): upload a raw video,
 * pick a style, poll progress, download the result. Kept separate from KaraokeCaptionController
 * because that one assumes panel and backend share a filesystem (bare local paths in and out) —
 * this one owns the multipart-upload / byte-streaming-download boundary a browser actually
 * needs, plus IP-based free-tier gating (WebQuotaService) that has no equivalent for the
 * already-licensed desktop panel.
 */
@RestController
public class WebCaptionController {

    private final WebCaptionOrchestrationService orchestrationService;
    private final WebTranscribeService transcribeService;
    private final WebQuotaService quotaService;
    private final WebUploadStore uploadStore;

    public WebCaptionController(WebCaptionOrchestrationService orchestrationService,
                                 WebTranscribeService transcribeService,
                                 WebQuotaService quotaService,
                                 WebUploadStore uploadStore) {
        this.orchestrationService = orchestrationService;
        this.transcribeService = transcribeService;
        this.quotaService = quotaService;
        this.uploadStore = uploadStore;
    }

    @PostMapping("/api/web/upload")
    public ResponseEntity<?> upload(@RequestParam("video") MultipartFile video,
                                     @RequestHeader(value = "X-Device-Code", required = false) String deviceCode,
                                     @RequestHeader(value = "X-License-Token", required = false) String licenseToken,
                                     HttpServletRequest request) {
        if (video == null || video.isEmpty()) {
            return badRequest("video fayli talab qilinadi.");
        }

        String ip = ClientIpResolver.resolve(request);
        WebQuotaService.QuotaResult quota = quotaService.checkAndReserve(ip, deviceCode, licenseToken);
        if (!quota.allowed()) {
            String code = quota.pseudoDeviceCode();
            return ResponseEntity.status(HttpStatus.PAYMENT_REQUIRED).body(new QuotaExceededResponse(
                    "Kunlik bepul limit tugadi. Faollashtirish uchun botga yozing.",
                    code, "https://t.me/ravoncaptions_bot?start=" + code));
        }

        try {
            String uploadId = UUID.randomUUID().toString();
            Path baseDir = Path.of(System.getProperty("java.io.tmpdir"), "ravon-web", "uploads");
            Files.createDirectories(baseDir);
            Path uploadDir = Files.createDirectory(baseDir.resolve(uploadId));
            Path dest = uploadDir.resolve("source" + extensionOf(video.getOriginalFilename()));
            video.transferTo(dest);
            uploadStore.put(uploadId, dest);
            return ResponseEntity.ok(new UploadResponse(uploadId));
        } catch (IOException e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(new ErrorResponse("Video saqlashda xatolik."));
        }
    }

    @PostMapping("/api/web/transcribe")
    public ResponseEntity<?> transcribe(@RequestBody WebTranscribeRequest request) {
        if (request.uploadId() == null || request.uploadId().isBlank()) {
            return badRequest("uploadId talab qilinadi.");
        }
        // peek(), not take(): the video is still needed by /api/web/caption once the visitor
        // has reviewed/edited the transcript and picked a style.
        Path videoPath = uploadStore.peek(request.uploadId());
        if (videoPath == null || !Files.isRegularFile(videoPath)) {
            return badRequest("Yuklangan video topilmadi (eskirgan bo'lishi mumkin) — qaytadan yuklang.");
        }

        try {
            String jobId = transcribeService.submit(videoPath);
            return ResponseEntity.ok(new JobIdResponse(jobId));
        } catch (WebTranscribeService.ServerBusyException e) {
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).body(new ErrorResponse(e.getMessage()));
        }
    }

    @GetMapping("/api/web/transcribe/status/{jobId}")
    public ResponseEntity<WebTranscribeJobStatus> transcribeStatus(@PathVariable String jobId) {
        WebTranscribeService.Snapshot snapshot = transcribeService.status(jobId);
        return ResponseEntity.ok(new WebTranscribeJobStatus(snapshot.status(), snapshot.words(), snapshot.error()));
    }

    @PostMapping("/api/web/caption")
    public ResponseEntity<?> create(@RequestBody WebCaptionRequest request) {
        if (request.uploadId() == null || request.uploadId().isBlank()) {
            return badRequest("uploadId talab qilinadi.");
        }
        if (request.styleKey() == null || KaraokeStylePresets.byKey(request.styleKey()) == null) {
            return badRequest("Noma'lum stil: " + request.styleKey());
        }
        String wordsError = validateWords(request.words());
        if (wordsError != null) {
            return badRequest(wordsError);
        }
        Path videoPath = uploadStore.take(request.uploadId());
        if (videoPath == null || !Files.isRegularFile(videoPath)) {
            return badRequest("Yuklangan video topilmadi (eskirgan bo'lishi mumkin) — qaytadan yuklang.");
        }

        try {
            String jobId = orchestrationService.submit(videoPath, request.styleKey(), request.words(), request.renderOptions());
            return ResponseEntity.ok(new JobIdResponse(jobId));
        } catch (ServerBusyException e) {
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).body(new ErrorResponse(e.getMessage()));
        }
    }

    /** Basic sanity check on browser-supplied (possibly edited) word timings — not a trust
     * boundary against a malicious caller (there isn't one worth guarding against here), just
     * enough to keep obviously-broken values (negative/reversed times) out of AssSubtitleBuilder. */
    private static String validateWords(List<Word> words) {
        if (words == null || words.isEmpty()) {
            return "words talab qilinadi (avval /api/web/transcribe chaqirilgan bo'lishi kerak).";
        }
        for (Word w : words) {
            if (w.text() == null || w.text().isBlank()) {
                return "Bo'sh so'z matni topildi.";
            }
            if (w.start() < 0 || w.end() < w.start()) {
                return "Noto'g'ri so'z vaqti: " + w.text();
            }
        }
        return null;
    }

    @GetMapping("/api/web/caption/status/{jobId}")
    public ResponseEntity<WebCaptionJobStatus> status(@PathVariable String jobId) {
        WebCaptionOrchestrationService.Snapshot snapshot = orchestrationService.status(jobId);
        // Deliberately a path SEGMENT ("web/caption/download/<id>"), not an absolute "/api/..."
        // URL: nginx proxies the site's calls through a "/videocaption-api/" prefix that maps
        // onto this app's "/api/" root, so the browser's actual path differs from this app's own
        // routing. The frontend appends this to its own configured API base instead.
        String downloadUrl = "done".equals(snapshot.status()) ? "web/caption/download/" + jobId : null;
        return ResponseEntity.ok(new WebCaptionJobStatus(
                snapshot.status(), snapshot.stage(), snapshot.progressPercent(), downloadUrl, snapshot.error()));
    }

    @GetMapping("/api/web/caption/download/{jobId}")
    public ResponseEntity<?> download(@PathVariable String jobId) {
        WebCaptionOrchestrationService.Snapshot snapshot = orchestrationService.status(jobId);
        if (!"done".equals(snapshot.status()) || snapshot.outputPath() == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(new ErrorResponse("Video tayyor emas yoki topilmadi."));
        }
        Path outputPath = Path.of(snapshot.outputPath());
        if (!Files.isRegularFile(outputPath)) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(new ErrorResponse("Video topilmadi (eskirgan)."));
        }
        FileSystemResource resource = new FileSystemResource(outputPath);
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + outputPath.getFileName() + "\"")
                .contentType(MediaType.parseMediaType("video/mp4"))
                .body(resource);
    }

    /** Keeps only a short, safe extension from the client-supplied filename (defends against path-y input). */
    private static String extensionOf(String originalFilename) {
        if (originalFilename == null) {
            return "";
        }
        int dot = originalFilename.lastIndexOf('.');
        if (dot < 0 || dot == originalFilename.length() - 1) {
            return "";
        }
        String ext = originalFilename.substring(dot).toLowerCase();
        return ext.matches("\\.[a-z0-9]{1,5}") ? ext : "";
    }

    private record UploadResponse(String uploadId) {
    }

    private record JobIdResponse(String jobId) {
    }

    private ResponseEntity<ErrorResponse> badRequest(String message) {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(new ErrorResponse(message));
    }
}
