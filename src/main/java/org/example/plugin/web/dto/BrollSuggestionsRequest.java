package org.example.plugin.web.dto;

import java.util.List;

import org.example.plugin.model.Segment;

public record BrollSuggestionsRequest(List<Segment> segments) {
}
