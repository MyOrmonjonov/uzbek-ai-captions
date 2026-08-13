package org.example.plugin.web;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Map;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Lets the CEP panel ask the locally-running backend which build it is, so it can compare
 * against srt_bot's /backend/version and self-update without the user ever re-running the
 * installer (see main.js's checkBackendUpdate()). backend-version.txt is written by the CI
 * workflow right before "mvnw package" -- a plain `mvn spring-boot:run` in dev has no such
 * file, hence the "dev" fallback rather than failing to start.
 */
@RestController
public class VersionController {

    @GetMapping("/api/version")
    public Map<String, String> version() {
        return Map.of("version", readVersion());
    }

    private static String readVersion() {
        try (InputStream in = VersionController.class.getResourceAsStream("/backend-version.txt")) {
            if (in == null) {
                return "dev";
            }
            return new String(in.readAllBytes(), StandardCharsets.UTF_8).trim();
        } catch (IOException e) {
            return "dev";
        }
    }
}
