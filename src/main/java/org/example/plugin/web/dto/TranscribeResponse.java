package org.example.plugin.web.dto;

import java.util.List;

import org.example.plugin.model.Segment;
import org.example.plugin.model.Word;

public record TranscribeResponse(String srtPath, String srt, List<Segment> segments, List<Word> words) {
}
