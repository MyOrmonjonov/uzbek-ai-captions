package org.example.plugin.model;

import java.util.List;

public record BrollSuggestion(double start, double end, String keyword, List<BrollCandidate> candidates) {
}
