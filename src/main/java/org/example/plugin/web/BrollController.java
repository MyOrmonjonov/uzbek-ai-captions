package org.example.plugin.web;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import org.example.plugin.model.BrollCandidate;
import org.example.plugin.model.BrollScene;
import org.example.plugin.model.BrollSuggestion;
import org.example.plugin.service.BrollSceneService;
import org.example.plugin.service.GifConversionService;
import org.example.plugin.service.GiphyService;
import org.example.plugin.service.LicenseService;
import org.example.plugin.service.PexelsService;
import org.example.plugin.web.dto.BrollDownloadRequest;
import org.example.plugin.web.dto.BrollDownloadResponse;
import org.example.plugin.web.dto.BrollSuggestionsRequest;
import org.example.plugin.web.dto.BrollSuggestionsResponse;
import org.example.plugin.web.dto.ErrorResponse;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class BrollController {

    private static final int CANDIDATES_PER_TYPE = 2;

    private final BrollSceneService brollSceneService;
    private final PexelsService pexelsService;
    private final GiphyService giphyService;
    private final GifConversionService gifConversionService;
    private final LicenseService licenseService;
    private final HttpClient httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(30))
            .build();

    public BrollController(BrollSceneService brollSceneService, PexelsService pexelsService,
                            GiphyService giphyService, GifConversionService gifConversionService,
                            LicenseService licenseService) {
        this.brollSceneService = brollSceneService;
        this.pexelsService = pexelsService;
        this.giphyService = giphyService;
        this.gifConversionService = gifConversionService;
        this.licenseService = licenseService;
    }

    @PostMapping("/api/broll-suggestions")
    public ResponseEntity<?> suggestions(@RequestBody BrollSuggestionsRequest request) {
        LicenseService.Status license = licenseService.checkValid();
        if (!license.valid()) {
            return TranscribeController.licenseRequired(license);
        }

        if (request.segments() == null || request.segments().isEmpty()) {
            return badRequest("segments talab qilinadi.");
        }

        try {
            List<BrollScene> scenes = brollSceneService.groupIntoScenes(request.segments());
            List<BrollSuggestion> suggestions = scenes.stream()
                    .map(scene -> {
                        List<BrollCandidate> candidates = pickCandidates(scene.keyword());
                        return candidates.isEmpty() ? null
                                : new BrollSuggestion(scene.start(), scene.end(), scene.keyword(), candidates);
                    })
                    .filter(s -> s != null)
                    .toList();
            return ResponseEntity.ok(new BrollSuggestionsResponse(suggestions));
        } catch (RuntimeException e) {
            return serverError(e.getMessage());
        }
    }

    /**
     * Each type is fetched and capped independently (not a shared total) so that, whenever a
     * type has matches at all, the panel's per-type grid gets a full 2 candidates to lay out as
     * two columns — a shared/interleaved total would usually leave each type with just 1,
     * making the "2 ustunli grid" collapse to a single column in practice.
     */
    private List<BrollCandidate> pickCandidates(String keyword) {
        List<BrollCandidate> videos = pexelsService.searchVideos(keyword, CANDIDATES_PER_TYPE);
        List<BrollCandidate> photos = pexelsService.searchPhotos(keyword, CANDIDATES_PER_TYPE);
        List<BrollCandidate> gifs = giphyService.searchGifs(keyword, CANDIDATES_PER_TYPE);

        List<BrollCandidate> result = new ArrayList<>();
        result.addAll(videos);
        result.addAll(photos);
        result.addAll(gifs);
        return result;
    }

    @PostMapping("/api/broll-download")
    public ResponseEntity<?> download(@RequestBody BrollDownloadRequest request) {
        LicenseService.Status license = licenseService.checkValid();
        if (!license.valid()) {
            return TranscribeController.licenseRequired(license);
        }

        if (request.mediaUrl() == null || request.mediaUrl().isBlank()) {
            return badRequest("mediaUrl talab qilinadi.");
        }
        String type = request.type() != null ? request.type() : "video";

        try {
            Path baseDir = Path.of(System.getProperty("java.io.tmpdir"), "uzbek-ai-captions");
            Files.createDirectories(baseDir);
            Path sessionDir = Files.createDirectory(baseDir.resolve(UUID.randomUUID().toString()));

            HttpRequest downloadRequest = HttpRequest.newBuilder()
                    .uri(URI.create(request.mediaUrl()))
                    .timeout(Duration.ofMinutes(2))
                    .GET()
                    .build();
            HttpResponse<byte[]> response = httpClient.send(downloadRequest, HttpResponse.BodyHandlers.ofByteArray());
            if (response.statusCode() != 200) {
                return serverError("Media yuklab bo'lmadi (" + response.statusCode() + ")");
            }

            if ("gif".equals(type)) {
                Path gifPath = sessionDir.resolve("broll.gif");
                Files.write(gifPath, response.body());
                Path mp4Path = sessionDir.resolve("broll.mp4");
                gifConversionService.convertToMp4(gifPath, mp4Path);
                return ResponseEntity.ok(new BrollDownloadResponse(mp4Path.toString()));
            }

            String extension = "photo".equals(type) ? "jpg" : "mp4";
            Path dest = sessionDir.resolve("broll." + extension);
            Files.write(dest, response.body());
            return ResponseEntity.ok(new BrollDownloadResponse(dest.toString()));
        } catch (IOException e) {
            return serverError(e.getMessage());
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return serverError("So'rov to'xtatildi");
        }
    }

    private ResponseEntity<ErrorResponse> badRequest(String message) {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(new ErrorResponse(message));
    }

    private ResponseEntity<ErrorResponse> serverError(String message) {
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(new ErrorResponse(message != null ? message : "Noma'lum xatolik"));
    }
}