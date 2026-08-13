package org.example.plugin.web.dto;

import java.util.List;

import org.example.plugin.model.Word;

public record KaraokeCaptionRequest(String videoPath, List<Word> words, String styleKey) {
}
