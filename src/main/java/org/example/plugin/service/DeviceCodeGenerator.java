package org.example.plugin.service;

import java.security.SecureRandom;

/**
 * Generates device codes in the XXXX-XXXX-XXXX shape srt_bot's DEVICE_CODE_RE expects
 * (licensing_handlers.py). Shared by DeviceIdentityService (this JVM's own persistent code)
 * and WebQuotaService (a per-visitor pseudo code handed to anonymous web-tool users so they
 * have something to paste into the bot when paying).
 */
final class DeviceCodeGenerator {

    private static final char[] ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789".toCharArray();
    private static final SecureRandom RANDOM = new SecureRandom();

    private DeviceCodeGenerator() {
    }

    static String generate() {
        StringBuilder sb = new StringBuilder();
        for (int group = 0; group < 3; group++) {
            if (group > 0) {
                sb.append('-');
            }
            for (int i = 0; i < 4; i++) {
                sb.append(ALPHABET[RANDOM.nextInt(ALPHABET.length)]);
            }
        }
        return sb.toString();
    }
}
