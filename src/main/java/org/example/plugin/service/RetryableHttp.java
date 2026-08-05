package org.example.plugin.service;

import java.io.IOException;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;

/**
 * Gemini (and other upstream APIs) occasionally return 503/429 for a moment under load —
 * not a real failure, just "try again shortly". Retrying a couple of times with backoff
 * absorbs these transient blips instead of surfacing them as a broken generation to the user.
 */
final class RetryableHttp {

    private RetryableHttp() {
    }

    static HttpResponse<String> sendWithRetry(HttpClient client, HttpRequest request, int maxAttempts)
            throws IOException, InterruptedException {
        for (int attempt = 1; attempt <= maxAttempts; attempt++) {
            HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());
            boolean lastAttempt = attempt == maxAttempts;
            if (!isRetryable(response.statusCode()) || lastAttempt) {
                return response;
            }
            Thread.sleep(1000L * (1L << (attempt - 1)));
        }
        throw new IllegalStateException("unreachable");
    }

    private static boolean isRetryable(int statusCode) {
        return statusCode == 429 || statusCode == 500 || statusCode == 502 || statusCode == 503 || statusCode == 504;
    }
}