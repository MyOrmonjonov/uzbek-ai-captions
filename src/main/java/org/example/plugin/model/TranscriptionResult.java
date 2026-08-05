package org.example.plugin.model;

import java.util.List;

public record TranscriptionResult(List<Word> words, List<Segment> segments) {
}
