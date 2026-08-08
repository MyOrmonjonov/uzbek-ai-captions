package org.example.plugin.web.dto;

/**
 * status: "running" | "done" | "error".
 * stage: short machine-readable label for the panel to show a human message for
 * ("audio" | "transcribing" | "building" | "done").
 * progressPercent: 0-100, best-effort — see TranscriptionJobService for how "transcribing"
 * (the one stage with no real progress signal from Whisper/Gemini) is estimated.
 */
public record TranscribeJobStatus(
        String status, String stage, int progressPercent, TranscribeResponse result, String error) {
}
