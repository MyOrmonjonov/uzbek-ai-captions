package org.example.plugin.web.dto;

public record TranscribeRequest(String filePath, Integer maxLines, Integer wordsPerLine, String translateTo) {
}