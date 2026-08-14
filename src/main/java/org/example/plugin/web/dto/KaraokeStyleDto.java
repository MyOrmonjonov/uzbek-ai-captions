package org.example.plugin.web.dto;

/**
 * What a style picker needs to render a card. The CEP panel only ever used key/displayName
 * (it shows rendered preview clips instead); the web tool's gallery has no per-style preview
 * clips, so it renders a live styled text preview from the extra font/color fields instead.
 */
public record KaraokeStyleDto(
        String key,
        String displayName,
        String fontName,
        String primaryColorHex,
        String highlightColorHex,
        boolean bold) {
}
