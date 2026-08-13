package org.example.plugin.web.dto;

/** What the panel's style picker actually needs — no ASS/color internals, just key + label. */
public record KaraokeStyleDto(String key, String displayName) {
}
