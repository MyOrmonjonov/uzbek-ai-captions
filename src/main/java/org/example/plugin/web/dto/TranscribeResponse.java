package org.example.plugin.web.dto;

import java.util.List;

import org.example.plugin.model.Segment;

public record TranscribeResponse(String srtPath, String srt, List<Segment> segments) {
}
