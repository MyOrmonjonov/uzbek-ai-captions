package org.example.plugin.service;

import java.util.ArrayList;
import java.util.List;

import org.example.plugin.model.TranscriptionResult;
import org.example.plugin.model.Word;
import org.springframework.stereotype.Service;

/** Builds SRT cues by packing words into lines/cues based on explicit word-count limits. */
@Service
public class SrtBuilderService {

    private static final double MIN_CUE_DURATION = 0.8;
    private static final double INTER_CUE_GAP = 0.08;
    private static final double PAUSE_BREAK_SECONDS = 0.6;

    private record Cue(double start, double end, List<String> lines) {
    }

    public String buildSrt(TranscriptionResult result, int maxLines, int wordsPerLine) {
        double maxCueDuration = computeMaxCueDuration(maxLines, wordsPerLine);
        List<Cue> cues = packWords(result.words(), maxLines, wordsPerLine, maxCueDuration, PAUSE_BREAK_SECONDS);
        cues = fixOverlaps(cues);
        return renderSrt(cues);
    }

    private static double computeMaxCueDuration(int maxLines, int wordsPerLine) {
        double budget = maxLines * wordsPerLine;
        return Math.min(8.0, Math.max(2.0, 1.0 + budget * 0.6));
    }

    private static List<Cue> packWords(List<Word> words, int maxLines, int wordsPerLine,
                                        double maxCueDuration, double pauseBreakS) {
        int totalWordsBudget = maxLines * wordsPerLine;
        int sentenceBreakThreshold = Math.max(1, (int) Math.ceil(totalWordsBudget * 0.6));
        List<Cue> cues = new ArrayList<>();

        Double cueStart = null;
        double cueEnd = 0;
        List<List<String>> lines = new ArrayList<>(List.of(new ArrayList<>()));
        Double prevWordEnd = null;
        int placedWords = 0;

        for (Word w : words) {
            String text = w.text();
            if (text == null || text.isEmpty()) {
                continue;
            }

            if (cueStart != null) {
                boolean gapBreak = prevWordEnd != null && (w.start() - prevWordEnd) > pauseBreakS;
                boolean durationBreak = (w.end() - cueStart) > maxCueDuration;
                if (gapBreak || durationBreak) {
                    cueStart = finalizeCue(cues, cueStart, cueEnd, lines);
                    lines = new ArrayList<>(List.of(new ArrayList<>()));
                    placedWords = 0;
                }
            }

            if (cueStart == null) {
                cueStart = w.start();
                lines = new ArrayList<>(List.of(new ArrayList<>()));
                placedWords = 0;
            }

            List<String> curLine = lines.get(lines.size() - 1);
            if (curLine.size() < wordsPerLine) {
                curLine.add(text);
            } else if (lines.size() < maxLines) {
                List<String> newLine = new ArrayList<>();
                newLine.add(text);
                lines.add(newLine);
            } else {
                finalizeCue(cues, cueStart, cueEnd, lines);
                cueStart = w.start();
                List<String> newLine = new ArrayList<>();
                newLine.add(text);
                lines = new ArrayList<>(List.of(newLine));
                placedWords = 0;
            }
            placedWords++;

            cueEnd = w.end();
            prevWordEnd = w.end();

            char lastChar = text.charAt(text.length() - 1);
            if (".!?".indexOf(lastChar) >= 0 && placedWords >= sentenceBreakThreshold) {
                cueStart = finalizeCue(cues, cueStart, cueEnd, lines);
                lines = new ArrayList<>(List.of(new ArrayList<>()));
                placedWords = 0;
                prevWordEnd = null;
            }
        }

        finalizeCue(cues, cueStart, cueEnd, lines);
        return cues;
    }

    /** Appends a finalized cue to {@code cues} if there's anything to finalize; returns the reset cueStart (null). */
    private static Double finalizeCue(List<Cue> cues, Double cueStart, double cueEnd, List<List<String>> lines) {
        if (cueStart == null) {
            return null;
        }
        List<String> textLines = new ArrayList<>();
        for (List<String> l : lines) {
            if (!l.isEmpty()) {
                textLines.add(String.join(" ", l));
            }
        }
        if (!textLines.isEmpty()) {
            double end = Math.max(cueEnd, cueStart + MIN_CUE_DURATION);
            cues.add(new Cue(cueStart, end, textLines));
        }
        return null;
    }

    static String formatTimestamp(double seconds) {
        seconds = Math.max(seconds, 0.0);
        long totalMs = Math.round(seconds * 1000);
        long hours = totalMs / 3_600_000;
        long rem = totalMs % 3_600_000;
        long minutes = rem / 60_000;
        rem = rem % 60_000;
        long secs = rem / 1000;
        long ms = rem % 1000;
        return String.format("%02d:%02d:%02d,%03d", hours, minutes, secs, ms);
    }

    private static List<Cue> fixOverlaps(List<Cue> cues) {
        List<Cue> adjusted = new ArrayList<>(cues);
        for (int i = 0; i < adjusted.size() - 1; i++) {
            double nextStart = adjusted.get(i + 1).start();
            Cue cue = adjusted.get(i);
            if (cue.end() > nextStart - INTER_CUE_GAP) {
                double newEnd = Math.max(cue.start() + 0.1, nextStart - INTER_CUE_GAP);
                adjusted.set(i, new Cue(cue.start(), newEnd, cue.lines()));
            }
        }
        return adjusted;
    }

    private static String renderSrt(List<Cue> cues) {
        StringBuilder out = new StringBuilder();
        int i = 1;
        for (Cue cue : cues) {
            out.append(i++).append('\n');
            out.append(formatTimestamp(cue.start())).append(" --> ").append(formatTimestamp(cue.end())).append('\n');
            for (String line : cue.lines()) {
                out.append(line).append('\n');
            }
            out.append('\n');
        }
        return out.toString().strip() + "\n";
    }
}