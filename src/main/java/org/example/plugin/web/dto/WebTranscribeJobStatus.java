package org.example.plugin.web.dto;

import java.util.List;

import org.example.plugin.model.Word;

/**
 * status: "running" | "done" | "error". words is populated only once status is "done" — the
 * editor screen (website/subtitr.html) renders these as clickable/editable chips before any
 * style is picked, then sends the (possibly edited) list back via WebCaptionRequest.
 */
public record WebTranscribeJobStatus(String status, List<Word> words, String error) {
}
