package org.example.plugin.web.dto;

import java.util.List;

import org.example.plugin.model.BrollSuggestion;

public record BrollSuggestionsResponse(List<BrollSuggestion> suggestions) {
}
