package org.example.plugin.model;

/** type: "video" | "photo" | "gif" — tells the panel/host how to label and insert it. */
public record BrollCandidate(String type, String thumbnailUrl, String mediaUrl) {
}