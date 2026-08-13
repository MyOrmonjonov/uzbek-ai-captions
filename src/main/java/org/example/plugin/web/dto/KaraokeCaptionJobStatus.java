package org.example.plugin.web.dto;

/**
 * status: "running" | "done" | "error".
 * stage: "preparing" | "encoding" | "done" — short machine-readable label, same idea as
 * TranscribeJobStatus's stage field.
 * outputPath: absolute path to the burned-in video once status is "done" (panel and backend
 * run on the same machine, so a plain filesystem path is enough — no need to stream bytes).
 */
public record KaraokeCaptionJobStatus(
        String status, String stage, int progressPercent, String outputPath, String error) {
}
