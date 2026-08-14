package org.example.plugin.web;

import jakarta.servlet.http.HttpServletRequest;

/**
 * Reads the real visitor IP for the web caption tool's per-IP free-use quota. Trusting
 * X-Forwarded-For is safe here only because application-webserver.properties binds
 * server.address to 127.0.0.1 — the only path in is through nginx, which is the sole thing
 * setting this header.
 */
final class ClientIpResolver {

    private ClientIpResolver() {
    }

    static String resolve(HttpServletRequest request) {
        String forwardedFor = request.getHeader("X-Forwarded-For");
        if (forwardedFor != null && !forwardedFor.isBlank()) {
            return forwardedFor.split(",")[0].trim();
        }
        return request.getRemoteAddr();
    }
}
