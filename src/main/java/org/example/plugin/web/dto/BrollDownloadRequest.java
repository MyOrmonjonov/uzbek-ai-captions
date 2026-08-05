package org.example.plugin.web.dto;

/** type: "video" | "photo" | "gif" — picked from the chosen BrollCandidate. */
public record BrollDownloadRequest(String mediaUrl, String type) {
}