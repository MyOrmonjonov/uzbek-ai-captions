package org.example.plugin.web.dto;

/**
 * Returned (402) when an anonymous visitor's daily free-upload IP quota is used up.
 * deviceCode is a stable per-IP pseudo code (WebQuotaService) the visitor pastes into the bot
 * to pay — same code shape/flow the desktop plugin's "Botga o'tish" button already uses.
 */
public record QuotaExceededResponse(String error, String deviceCode, String botUrl) {
}
