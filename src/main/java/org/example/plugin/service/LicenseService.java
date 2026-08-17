package org.example.plugin.service;

import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;

import org.example.plugin.config.PluginProperties;
import org.springframework.stereotype.Service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * Checks the activation token against the central license server (srt_bot's
 * /license/verify). Deliberately does NOT trust a purely local check: a
 * token is only as good as what the server currently says about it, so a
 * revoked or expired subscription stops working everywhere on the next
 * check. A short-lived cache avoids hitting the server on every single
 * request, and a longer offline grace period tolerates brief network drops
 * without locking out an already-paying user.
 */
@Service
public class LicenseService {

    private static final long CACHE_TTL_MILLIS = Duration.ofHours(1).toMillis();
    private static final long OFFLINE_GRACE_MILLIS = Duration.ofHours(48).toMillis();

    public record Status(boolean valid, double daysLeft, String reason) {
        static final Status NOT_ACTIVATED = new Status(false, 0, "not_activated");
    }

    private record CachedStatus(Status status, long checkedAtMillis) {
    }

    private final PluginProperties properties;
    private final DeviceIdentityService identityService;
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final HttpClient httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(10))
            .build();

    private volatile CachedStatus cached;

    public LicenseService(PluginProperties properties, DeviceIdentityService identityService) {
        this.properties = properties;
        this.identityService = identityService;
    }

    public String deviceCode() {
        return identityService.getDeviceCode();
    }

    /** Re-checks (subject to caching) whether the currently saved token is valid. */
    public Status checkValid() {
        String token = identityService.loadSavedToken();
        if (token == null) {
            return Status.NOT_ACTIVATED;
        }

        long now = System.currentTimeMillis();
        CachedStatus snapshot = cached;
        if (snapshot != null && snapshot.status.valid() && (now - snapshot.checkedAtMillis) < CACHE_TTL_MILLIS) {
            return snapshot.status;
        }

        try {
            Status fresh = callVerifyWithRetry(identityService.getDeviceCode(), token);
            cached = new CachedStatus(fresh, now);
            return fresh;
        } catch (IOException | InterruptedException e) {
            if (e instanceof InterruptedException) {
                Thread.currentThread().interrupt();
            }
            if (snapshot != null && snapshot.status.valid() && (now - snapshot.checkedAtMillis) < OFFLINE_GRACE_MILLIS) {
                return snapshot.status;
            }
            return new Status(false, 0, "network_error");
        }
    }

    /** Verifies a candidate token immediately (no cache) and, if valid, saves it as the active token. */
    public Status activate(String token) {
        if (token == null || token.isBlank()) {
            return new Status(false, 0, "missing_token");
        }
        try {
            Status result = callVerifyWithRetry(identityService.getDeviceCode(), token.trim());
            if (result.valid()) {
                identityService.saveToken(token.trim());
                cached = new CachedStatus(result, System.currentTimeMillis());
            }
            return result;
        } catch (IOException | InterruptedException e) {
            if (e instanceof InterruptedException) {
                Thread.currentThread().interrupt();
            }
            return new Status(false, 0, "network_error");
        }
    }

    /**
     * Polls the license server by device code alone (no token) -- what the panel's activation
     * screen calls on a timer instead of making the user copy a token out of the bot and paste
     * it back in. Saves the token locally the moment the server reports one, exactly like
     * activate() does, so every subsequent checkValid() call works unchanged.
     */
    public Status pollActivation() {
        try {
            return callStatusWithRetry(identityService.getDeviceCode());
        } catch (IOException | InterruptedException e) {
            if (e instanceof InterruptedException) {
                Thread.currentThread().interrupt();
            }
            return new Status(false, 0, "network_error");
        }
    }

    private Status callStatusWithRetry(String deviceCode) throws IOException, InterruptedException {
        IOException lastError = null;
        for (int attempt = 1; attempt <= 3; attempt++) {
            try {
                return callStatus(deviceCode);
            } catch (IOException e) {
                lastError = e;
                if (attempt < 3) {
                    Thread.sleep(500L * attempt);
                }
            }
        }
        throw lastError;
    }

    private Status callStatus(String deviceCode) throws IOException, InterruptedException {
        String verifyUrl = properties.getLicense().getServerUrl();
        String base = verifyUrl.endsWith("/verify") ? verifyUrl.substring(0, verifyUrl.length() - "/verify".length()) : verifyUrl;
        String statusUrl = base + "/status?deviceCode=" + URLEncoder.encode(deviceCode, StandardCharsets.UTF_8);

        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(statusUrl))
                .timeout(Duration.ofSeconds(10))
                .GET()
                .build();
        HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
        JsonNode root = objectMapper.readTree(response.body());
        boolean valid = root.path("valid").asBoolean(false);
        double daysLeft = root.path("daysLeft").asDouble(0);
        String reason = root.path("reason").asText("unknown");
        String token = root.path("token").asText(null);

        Status result = new Status(valid, daysLeft, reason);
        if (valid && token != null && !token.isBlank()) {
            identityService.saveToken(token);
            cached = new CachedStatus(result, System.currentTimeMillis());
        }
        return result;
    }

    /**
     * A single momentary blip (DNS hiccup, brief connection reset) shouldn't immediately
     * surface as "can't reach the license server" to the user — retry a couple of times
     * before giving up.
     */
    private Status callVerifyWithRetry(String deviceCode, String token) throws IOException, InterruptedException {
        IOException lastError = null;
        for (int attempt = 1; attempt <= 3; attempt++) {
            try {
                return callVerify(deviceCode, token);
            } catch (IOException e) {
                lastError = e;
                if (attempt < 3) {
                    Thread.sleep(500L * attempt);
                }
            }
        }
        throw lastError;
    }

    private Status callVerify(String deviceCode, String token) throws IOException, InterruptedException {
        String body = objectMapper.writeValueAsString(
                java.util.Map.of("deviceCode", deviceCode, "token", token));
        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(properties.getLicense().getServerUrl()))
                .timeout(Duration.ofSeconds(10))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(body, StandardCharsets.UTF_8))
                .build();

        HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
        JsonNode root = objectMapper.readTree(response.body());
        boolean valid = root.path("valid").asBoolean(false);
        double daysLeft = root.path("daysLeft").asDouble(0);
        String reason = root.path("reason").asText("unknown");
        return new Status(valid, daysLeft, reason);
    }
}