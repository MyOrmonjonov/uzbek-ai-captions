package org.example.plugin.web.dto;

import java.util.List;

import org.example.plugin.model.Word;

/** words comes from a prior /api/web/transcribe call, possibly edited (text and/or
 * start/end) by the visitor in the browser's transcript editor before submitting. */
public record WebCaptionRequest(String uploadId, String styleKey, List<Word> words) {
}
