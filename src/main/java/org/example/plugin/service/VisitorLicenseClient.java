package org.example.plugin.service;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Map;

import org.example.plugin.config.PluginProperties;
import org.springframework.stereotype.Service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * Verifies a (deviceCode, token) pair a web visitor supplies after paying via the bot — same
 * wire format as LicenseService.callVerify(), but parameterized by caller-supplied credentials
 * instead of this JVM's own DeviceIdentityService (an anonymous browser has no device of its
 * own). Hits the same, already-public license-verify server every desktop install already uses,
 * so this adds no new attack surface.
 */
@Service
public class VisitorLicenseClient {

    private final PluginProperties properties;
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final HttpClient httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(10))
            .build();

    public VisitorLicenseClient(PluginProperties properties) {
        this.properties = properties;
    }

    public LicenseService.Status verify(String deviceCode, String token) {
        try {
            String body = objectMapper.writeValueAsString(Map.of("deviceCode", deviceCode, "token", token));
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
            return new LicenseService.Status(valid, daysLeft, reason);
        } catch (IOException | InterruptedException e) {
            if (e instanceof InterruptedException) {
                Thread.currentThread().interrupt();
            }
            return new LicenseService.Status(false, 0, "network_error");
        }
    }
}
