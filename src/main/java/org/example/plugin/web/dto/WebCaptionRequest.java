package org.example.plugin.web.dto;

import java.util.List;

import org.example.plugin.model.RenderOptions;
import org.example.plugin.model.Word;

/** words comes from a prior /api/web/transcribe call, possibly edited (text and/or
 * start/end) by the visitor in the browser's transcript editor before submitting.
 * renderOptions is optional -- null means the style's own defaults (5-word single-line
 * bottom-center, no case/script transform, no auto-emphasis). */
public record WebCaptionRequest(String uploadId, String styleKey, List<Word> words, RenderOptions renderOptions) {
}
