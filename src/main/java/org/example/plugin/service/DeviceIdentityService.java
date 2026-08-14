package org.example.plugin.service;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

import org.springframework.stereotype.Service;

/**
 * Generates and persists a per-installation device code (shown to the user
 * to send to the licensing bot) and stores the activation token the user
 * pastes back in. Stored under the user's home directory so it survives
 * extension reinstalls/updates.
 */
@Service
public class DeviceIdentityService {

    private static final Path STORE_DIR = Path.of(System.getProperty("user.home"), ".uzbek-ai-captions");
    private static final Path DEVICE_FILE = STORE_DIR.resolve("device.id");
    private static final Path TOKEN_FILE = STORE_DIR.resolve("license.token");

    private String deviceCode;

    public synchronized String getDeviceCode() {
        if (deviceCode != null) {
            return deviceCode;
        }
        try {
            Files.createDirectories(STORE_DIR);
            if (Files.exists(DEVICE_FILE)) {
                deviceCode = Files.readString(DEVICE_FILE).trim();
            } else {
                deviceCode = DeviceCodeGenerator.generate();
                Files.writeString(DEVICE_FILE, deviceCode);
            }
        } catch (IOException e) {
            throw new IdentityException("Qurilma kodini saqlab bo'lmadi: " + e.getMessage(), e);
        }
        return deviceCode;
    }

    public synchronized String loadSavedToken() {
        try {
            if (Files.exists(TOKEN_FILE)) {
                String token = Files.readString(TOKEN_FILE).trim();
                return token.isEmpty() ? null : token;
            }
        } catch (IOException ignored) {
            // treated as "no token saved"
        }
        return null;
    }

    public synchronized void saveToken(String token) {
        try {
            Files.createDirectories(STORE_DIR);
            Files.writeString(TOKEN_FILE, token);
        } catch (IOException e) {
            throw new IdentityException("Tokenni saqlab bo'lmadi: " + e.getMessage(), e);
        }
    }

    public static class IdentityException extends RuntimeException {
        public IdentityException(String message, Throwable cause) {
            super(message, cause);
        }
    }
}