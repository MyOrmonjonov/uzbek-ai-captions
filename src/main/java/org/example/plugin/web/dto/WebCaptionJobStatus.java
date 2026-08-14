package org.example.plugin.web.dto;

/**
 * status: "running" | "done" | "error".
 * stage: "queued" | "extracting_audio" | "transcribing" | "encoding" | "done".
 * downloadUrl: set only once status is "done" — unlike KaraokeCaptionJobStatus's outputPath,
 * this is a path SEGMENT the browser appends to its own API base to GET the file (not a local
 * filesystem path — panel and browser do NOT share a filesystem — and not an absolute URL,
 * since the site reaches this app through an nginx prefix this app itself doesn't know about).
 */
public record WebCaptionJobStatus(
        String status, String stage, int progressPercent, String downloadUrl, String error) {
}
