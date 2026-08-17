package org.example.plugin.service;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.regex.Pattern;

import org.example.plugin.model.KaraokeStyle;
import org.example.plugin.model.RenderOptions;
import org.example.plugin.model.Word;

/**
 * Turns word-level transcription timing into an ASS (Advanced SubStation Alpha) subtitle file
 * that ffmpeg's "ass" filter (libass) burns directly into the video. ASS was picked over hand-
 * rolled frame compositing because its \k (karaoke) and \t (transform/animation) override tags
 * already do exactly this job natively and reliably — see KaraokeStyle's javadoc for how the two
 * animation templates map to \k vs. per-word \t.
 *
 * options (RenderOptions) is web-tool-only display customization layered on top of a
 * KaraokeStyle -- the desktop CEP panel always passes null here, which resolves to exactly the
 * original hardcoded behavior (5-word chunks, one line, no wrap, bottom-center, style's own
 * font, no case/script transform, no auto-emphasis), so the desktop output is unchanged.
 */
final class AssSubtitleBuilder {

    private static final int DEFAULT_WORDS_PER_GROUP = 5;
    // ASS \k values are in centiseconds and must be positive; a run of words with identical or
    // out-of-order ASR timestamps (rare, but seen with very short interjections) would otherwise
    // produce a zero/negative duration that libass either drops or renders as an instant flash.
    private static final int MIN_CENTISECONDS = 3;

    private static final Pattern SENTENCE_END = Pattern.compile("[.!?]$");
    private static final Pattern CLAUSE_END = Pattern.compile("[,.!?]$");
    private static final Pattern TRAILING_PUNCT = Pattern.compile("[.,!?]+$");
    private static final Set<String> CLAUSE_CONJUNCTIONS = Set.of(
            "va", "lekin", "ammo", "biroq", "keyin", "chunki", "shuning", "uchun", "yoki", "ham");
    private static final int SENTENCE_GROUP_CAP = 14;
    private static final int CLAUSE_GROUP_CAP = 8;

    // Short/functional Uzbek words that auto-emphasis skips -- everything else with 4+ letters
    // is treated as "content" and gets emphasized. A heuristic, not real NLP importance scoring.
    private static final Set<String> STOP_WORDS = Set.of(
            "bo'ladi", "boladi", "edi", "va", "bir", "bu", "shu", "kabi", "uchun", "ham", "hozir",
            "u", "biz", "siz", "men", "sen", "ular", "yoki", "lekin", "ammo", "biroq", "emas",
            "bor", "yo'q", "yoq", "qildi", "qiladi", "bo'lib", "bolib", "deb", "esa", "ya'ni", "yani");

    private AssSubtitleBuilder() {
    }

    static String build(List<Word> words, KaraokeStyle style, int videoWidth, int videoHeight) {
        return build(words, style, videoWidth, videoHeight, null);
    }

    static String build(List<Word> words, KaraokeStyle style, int videoWidth, int videoHeight, RenderOptions options) {
        int playResX = videoWidth > 0 ? videoWidth : 1080;
        int playResY = videoHeight > 0 ? videoHeight : 1920;

        int wordsOnScreen = (options != null && options.wordsOnScreen() != null) ? options.wordsOnScreen() : DEFAULT_WORDS_PER_GROUP;
        int wordsPerLine = (options != null && options.wordsPerLine() != null) ? options.wordsPerLine() : wordsOnScreen;
        int textSizePercent = (options != null && options.textSizePercent() != null) ? options.textSizePercent() : 100;
        String position = (options != null && options.position() != null) ? options.position() : "bottom";
        boolean uppercase = options != null && options.uppercase();
        boolean cyrillic = options != null && options.cyrillic();
        boolean autoEmphasis = options != null && options.autoEmphasis();
        String groupingMode = (options != null && options.groupingMode() != null) ? options.groupingMode() : "custom";
        String fontName = (options != null && options.fontOverride() != null) ? options.fontOverride() : style.fontName();

        String baseColorAss = resolveColorOverride(options != null ? options.textColorHex() : null, style.baseColorAss());
        String highlightColorAss = resolveColorOverride(options != null ? options.accentColorHex() : null, style.highlightColorAss());
        boolean outlineEnabled = options == null || options.outline() == null || options.outline();
        int outlineWidth = outlineEnabled ? 5 : 0;

        // Font sizes on KaraokeStylePresets are tuned against a 1920-tall reference frame so a
        // preset reads the same size regardless of the actual input resolution.
        int fontSize = Math.max(10, Math.round(style.fontSize() * (playResY / 1920f) * (textSizePercent / 100f)));

        int alignment = switch (position) {
            case "top" -> 8;
            case "middle" -> 5;
            default -> 2;
        };
        int marginV = switch (position) {
            case "top" -> Math.round(playResY * 0.08f);
            case "middle" -> 0;
            default -> Math.round(playResY * 0.15f);
        };

        StringBuilder sb = new StringBuilder();
        sb.append("[Script Info]\n")
                .append("ScriptType: v4.00+\n")
                .append("PlayResX: ").append(playResX).append('\n')
                .append("PlayResY: ").append(playResY).append('\n')
                .append("ScaledBorderAndShadow: yes\n\n")
                .append("[V4+ Styles]\n")
                .append("Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, "
                        + "BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, "
                        + "BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\n")
                .append("Style: Karaoke,").append(fontName).append(',').append(fontSize).append(',')
                .append(baseColorAss).append(',').append(highlightColorAss).append(',')
                .append(style.outlineColorAss()).append(",&H00000000,")
                .append(style.bold() ? "-1" : "0")
                // BorderStyle 3 (box) instead of 1 (outline) for BOXED_FILL -- reuses the same
                // already-opaque BackColour above as the box fill, "Outline" becomes box border
                // width instead of outline width under BorderStyle 3, both meanings of the same
                // ASS field.
                .append(",0,0,0,100,100,0,0,").append(style.template() == KaraokeStyle.AnimationTemplate.BOXED_FILL ? 3 : 1)
                .append(',').append(outlineWidth).append(",0,").append(alignment).append(",60,60,")
                .append(marginV).append(",1\n\n")
                .append("[Events]\n")
                .append("Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n");

        for (List<Word> line : groupWords(words, groupingMode, wordsOnScreen)) {
            switch (style.template()) {
                case KARAOKE_FILL, BOXED_FILL -> appendKaraokeFillLine(sb, line, wordsPerLine, uppercase, cyrillic, autoEmphasis, style);
                case WORD_POP -> appendWordPopLines(sb, line, baseColorAss, highlightColorAss, wordsPerLine, uppercase, cyrillic, autoEmphasis);
                case SLIDE_IN -> appendSlideInLine(sb, line, wordsPerLine, uppercase, cyrillic, autoEmphasis,
                        baseColorAss, highlightColorAss, alignment, playResX, playResY, marginV);
                case TYPEWRITER -> appendTypewriterLine(sb, line, uppercase, cyrillic);
                case COLOR_CYCLE -> appendColorCycleLine(sb, line, wordsPerLine, uppercase, cyrillic, autoEmphasis, baseColorAss);
                case SHAKE -> appendShakeLine(sb, line, wordsPerLine, uppercase, cyrillic, autoEmphasis, baseColorAss, highlightColorAss);
                case PUNCH -> appendPunchLine(sb, line, wordsPerLine, uppercase, cyrillic, autoEmphasis, baseColorAss, highlightColorAss);
                case CASCADE -> appendCascadeLine(sb, line, wordsPerLine, uppercase, cyrillic, autoEmphasis, baseColorAss, highlightColorAss);
                case BLUR_IN -> appendBlurInLine(sb, line, wordsPerLine, uppercase, cyrillic, autoEmphasis, baseColorAss, highlightColorAss);
            }
        }
        return sb.toString();
    }

    private static List<List<Word>> groupWords(List<Word> words, String groupingMode, int wordsOnScreen) {
        return switch (groupingMode) {
            case "toliq_gap" -> groupByBoundary(words, SENTENCE_END, false, SENTENCE_GROUP_CAP);
            case "manoga_qarab" -> groupByBoundary(words, CLAUSE_END, true, CLAUSE_GROUP_CAP);
            default -> chunk(words, Math.max(1, wordsOnScreen));
        };
    }

    private static List<List<Word>> chunk(List<Word> words, int size) {
        List<List<Word>> chunks = new ArrayList<>();
        for (int i = 0; i < words.size(); i += size) {
            chunks.add(words.subList(i, Math.min(words.size(), i + size)));
        }
        return chunks;
    }

    /** Groups words until a boundary pattern matches the (trailing-punctuation-stripped, when checkConjunctions) word, or a conjunction word, or the size cap is hit. */
    private static List<List<Word>> groupByBoundary(List<Word> words, Pattern boundaryPunct, boolean checkConjunctions, int cap) {
        List<List<Word>> groups = new ArrayList<>();
        List<Word> current = new ArrayList<>();
        for (Word w : words) {
            current.add(w);
            String trimmed = w.text().strip();
            boolean boundary = boundaryPunct.matcher(trimmed).find();
            if (!boundary && checkConjunctions) {
                String normalized = TRAILING_PUNCT.matcher(trimmed.toLowerCase()).replaceAll("");
                boundary = CLAUSE_CONJUNCTIONS.contains(normalized);
            }
            if (boundary || current.size() >= cap) {
                groups.add(current);
                current = new ArrayList<>();
            }
        }
        if (!current.isEmpty()) {
            groups.add(current);
        }
        return groups;
    }

    private static String resolveColorOverride(String cssHex, String styleDefaultAss) {
        String converted = AssColorUtil.fromCssHex(cssHex);
        return converted != null ? converted : styleDefaultAss;
    }

    private static boolean isEmphasized(String text) {
        String normalized = TRAILING_PUNCT.matcher(text.strip().toLowerCase()).replaceAll("");
        return normalized.length() >= 4 && !STOP_WORDS.contains(normalized);
    }

    private static String display(String text, boolean uppercase, boolean cyrillic) {
        String result = cyrillic ? CyrillicTransliterator.toCyrillic(text) : text;
        return uppercase ? result.toUpperCase() : result;
    }

    private static void appendKaraokeFillLine(StringBuilder sb, List<Word> line, int wordsPerLine,
                                               boolean uppercase, boolean cyrillic, boolean autoEmphasis, KaraokeStyle style) {
        double start = line.get(0).start();
        double end = line.get(line.size() - 1).end();
        StringBuilder text = new StringBuilder();
        for (int i = 0; i < line.size(); i++) {
            Word w = line.get(i);
            double durationSeconds = (i < line.size() - 1) ? (line.get(i + 1).start() - w.start()) : (w.end() - w.start());
            int centiseconds = Math.max(MIN_CENTISECONDS, (int) Math.round(durationSeconds * 100));
            String word = escape(display(w.text(), uppercase, cyrillic));
            text.append("{\\k").append(centiseconds).append('}');
            if (autoEmphasis && isEmphasized(w.text())) {
                text.append("{\\b1}").append(word).append("{\\b0}").append(' ');
            } else {
                text.append(word).append(' ');
            }
            if (wordsPerLine > 0 && (i + 1) % wordsPerLine == 0 && i < line.size() - 1) {
                text.append("\\N");
            }
        }
        appendDialogue(sb, start, end, text.toString().stripTrailing());
    }

    private static void appendWordPopLines(StringBuilder sb, List<Word> line, String baseColorAss, String highlightColorAss,
                                            int wordsPerLine, boolean uppercase, boolean cyrillic, boolean autoEmphasis) {
        for (int i = 0; i < line.size(); i++) {
            double start = line.get(i).start();
            double end = (i < line.size() - 1) ? line.get(i + 1).start() : line.get(i).end();
            if (end <= start) {
                end = start + (MIN_CENTISECONDS / 100.0);
            }
            StringBuilder text = new StringBuilder();
            for (int j = 0; j < line.size(); j++) {
                String word = escape(display(line.get(j).text(), uppercase, cyrillic));
                boolean emphasized = autoEmphasis && isEmphasized(line.get(j).text());
                if (j == i) {
                    // Pop-scale the active word up and settle back down, timed relative to THIS
                    // event's own Start (0ms) -- the reason this needs one Dialogue event per
                    // word rather than a single \k line: \t timing anchors to the event's Start,
                    // not to each karaoke syllable within it.
                    text.append("{\\c").append(highlightColorAss)
                            .append("\\t(0,120,\\fscx115\\fscy115)\\t(120,240,\\fscx100\\fscy100)}")
                            .append(word).append(' ');
                } else if (emphasized) {
                    text.append("{\\c").append(highlightColorAss).append("\\b1}").append(word).append("{\\b0}").append(' ');
                } else {
                    text.append("{\\c").append(baseColorAss).append('}').append(word).append(' ');
                }
                if (wordsPerLine > 0 && (j + 1) % wordsPerLine == 0 && j < line.size() - 1) {
                    text.append("\\N");
                }
            }
            appendDialogue(sb, start, end, text.toString().stripTrailing());
        }
    }

    private static void appendSlideInLine(StringBuilder sb, List<Word> line, int wordsPerLine,
                                           boolean uppercase, boolean cyrillic, boolean autoEmphasis,
                                           String baseColorAss, String highlightColorAss,
                                           int alignment, int playResX, int playResY, int marginV) {
        double start = line.get(0).start();
        double end = line.get(line.size() - 1).end();

        // \move requires an explicit \an anchor -- must match the Style's own Alignment so the
        // final (post-slide) position lands exactly where libass's automatic layout would have
        // put the text, not somewhere else on screen.
        int x = playResX / 2;
        int yFinal = switch (alignment) {
            case 8 -> marginV;
            case 5 -> playResY / 2;
            default -> playResY - marginV;
        };
        int slideDistance = Math.round(playResY * 0.04f);
        int yStart = alignment == 8 ? yFinal - slideDistance : yFinal + slideDistance;

        StringBuilder text = new StringBuilder("{\\an").append(alignment)
                .append("\\move(").append(x).append(',').append(yStart).append(',').append(x).append(',').append(yFinal).append(",0,220)")
                .append("\\alpha&HFF&\\t(0,220,\\alpha&H00&)}");
        for (int i = 0; i < line.size(); i++) {
            Word w = line.get(i);
            String word = escape(display(w.text(), uppercase, cyrillic));
            boolean emphasized = autoEmphasis && isEmphasized(w.text());
            if (emphasized) {
                text.append("{\\c").append(highlightColorAss).append("\\b1}").append(word).append("{\\b0\\c").append(baseColorAss).append('}').append(' ');
            } else {
                text.append(word).append(' ');
            }
            if (wordsPerLine > 0 && (i + 1) % wordsPerLine == 0 && i < line.size() - 1) {
                text.append("\\N");
            }
        }
        appendDialogue(sb, start, end, text.toString().stripTrailing());
    }

    private static void appendTypewriterLine(StringBuilder sb, List<Word> line, boolean uppercase, boolean cyrillic) {
        double start = line.get(0).start();
        double end = line.get(line.size() - 1).end();
        double duration = Math.max(end - start, MIN_CENTISECONDS / 100.0);

        StringBuilder full = new StringBuilder();
        for (int i = 0; i < line.size(); i++) {
            if (i > 0) {
                full.append(' ');
            }
            full.append(display(line.get(i).text(), uppercase, cyrillic));
        }
        String fullText = full.toString();
        int totalChars = fullText.length();
        if (totalChars == 0) {
            return;
        }

        for (int i = 1; i <= totalChars; i++) {
            double stepStart = start + duration * (i - 1) / totalChars;
            double stepEnd = (i == totalChars) ? end : start + duration * i / totalChars;
            appendDialogue(sb, stepStart, stepEnd, escape(fullText.substring(0, i)));
        }
    }

    // Arbitrary vivid cycle (ASS &HAABBGGRR): cyan, magenta, yellow, orange.
    private static final String[] COLOR_CYCLE_PALETTE = {"&H00FFFF00", "&H00FF00FF", "&H0000FFFF", "&H0000A5FF"};

    private static void appendColorCycleLine(StringBuilder sb, List<Word> line, int wordsPerLine,
                                              boolean uppercase, boolean cyrillic, boolean autoEmphasis, String baseColorAss) {
        double start = line.get(0).start();
        double end = line.get(line.size() - 1).end();
        double durationMs = Math.max(end - start, MIN_CENTISECONDS / 100.0) * 1000;
        int steps = COLOR_CYCLE_PALETTE.length;

        StringBuilder text = new StringBuilder("{\\c").append(baseColorAss);
        for (int i = 0; i < steps; i++) {
            long t1 = Math.round(durationMs * i / steps);
            long t2 = Math.round(durationMs * (i + 1) / steps);
            text.append("\\t(").append(t1).append(',').append(t2).append(",\\c").append(COLOR_CYCLE_PALETTE[i]).append(')');
        }
        text.append('}');

        for (int i = 0; i < line.size(); i++) {
            Word w = line.get(i);
            String word = escape(display(w.text(), uppercase, cyrillic));
            boolean emphasized = autoEmphasis && isEmphasized(w.text());
            if (emphasized) {
                text.append("{\\b1}").append(word).append("{\\b0}").append(' ');
            } else {
                text.append(word).append(' ');
            }
            if (wordsPerLine > 0 && (i + 1) % wordsPerLine == 0 && i < line.size() - 1) {
                text.append("\\N");
            }
        }
        appendDialogue(sb, start, end, text.toString().stripTrailing());
    }

    private static void appendShakeLine(StringBuilder sb, List<Word> line, int wordsPerLine,
                                         boolean uppercase, boolean cyrillic, boolean autoEmphasis,
                                         String baseColorAss, String highlightColorAss) {
        double start = line.get(0).start();
        double end = line.get(line.size() - 1).end();

        // A quick oscillating \frz wiggle on entrance (settles to 0 by 320ms), not a continuous
        // shake for the whole line -- constant shaking would fight with readability. No \org
        // override: libass's default rotation pivot (the text's own bounding-box center) is
        // fine for a brief wiggle like this.
        StringBuilder text = new StringBuilder(
                "{\\frz0\\t(0,60,\\frz-6)\\t(60,120,\\frz6)\\t(120,180,\\frz-4)\\t(180,240,\\frz4)\\t(240,320,\\frz0)}");
        for (int i = 0; i < line.size(); i++) {
            Word w = line.get(i);
            String word = escape(display(w.text(), uppercase, cyrillic));
            boolean emphasized = autoEmphasis && isEmphasized(w.text());
            if (emphasized) {
                text.append("{\\c").append(highlightColorAss).append("\\b1}").append(word).append("{\\b0\\c").append(baseColorAss).append('}').append(' ');
            } else {
                text.append(word).append(' ');
            }
            if (wordsPerLine > 0 && (i + 1) % wordsPerLine == 0 && i < line.size() - 1) {
                text.append("\\N");
            }
        }
        appendDialogue(sb, start, end, text.toString().stripTrailing());
    }

    private static void appendPunchLine(StringBuilder sb, List<Word> line, int wordsPerLine,
                                         boolean uppercase, boolean cyrillic, boolean autoEmphasis,
                                         String baseColorAss, String highlightColorAss) {
        double start = line.get(0).start();
        double end = line.get(line.size() - 1).end();

        // Scales in from oversized, overshoots slightly small, then settles at 100% -- an
        // "impact" landing rather than a smooth pop.
        StringBuilder text = new StringBuilder(
                "{\\fscx160\\fscy160\\t(0,90,\\fscx90\\fscy90)\\t(90,160,\\fscx100\\fscy100)}");
        for (int i = 0; i < line.size(); i++) {
            Word w = line.get(i);
            String word = escape(display(w.text(), uppercase, cyrillic));
            boolean emphasized = autoEmphasis && isEmphasized(w.text());
            if (emphasized) {
                text.append("{\\c").append(highlightColorAss).append("\\b1}").append(word).append("{\\b0\\c").append(baseColorAss).append('}').append(' ');
            } else {
                text.append(word).append(' ');
            }
            if (wordsPerLine > 0 && (i + 1) % wordsPerLine == 0 && i < line.size() - 1) {
                text.append("\\N");
            }
        }
        appendDialogue(sb, start, end, text.toString().stripTrailing());
    }

    private static void appendCascadeLine(StringBuilder sb, List<Word> line, int wordsPerLine,
                                           boolean uppercase, boolean cyrillic, boolean autoEmphasis,
                                           String baseColorAss, String highlightColorAss) {
        double start = line.get(0).start();
        double end = line.get(line.size() - 1).end();
        // No \move here (unlike SLIDE_IN) -- staggering each word's own \move would need each
        // word's actual on-screen x-offset within the line, which ASS gives no way to query from
        // Java. A staggered alpha-only fade still reads as "words falling into place one after
        // another" without needing that.
        int staggerMs = 90;

        StringBuilder text = new StringBuilder();
        for (int i = 0; i < line.size(); i++) {
            Word w = line.get(i);
            String word = escape(display(w.text(), uppercase, cyrillic));
            boolean emphasized = autoEmphasis && isEmphasized(w.text());
            long delay = (long) i * staggerMs;
            text.append("{\\alpha&HFF&\\t(").append(delay).append(',').append(delay + 150).append(",\\alpha&H00&)}");
            if (emphasized) {
                text.append("{\\c").append(highlightColorAss).append("\\b1}").append(word).append("{\\b0\\c").append(baseColorAss).append('}').append(' ');
            } else {
                text.append(word).append(' ');
            }
            if (wordsPerLine > 0 && (i + 1) % wordsPerLine == 0 && i < line.size() - 1) {
                text.append("\\N");
            }
        }
        appendDialogue(sb, start, end, text.toString().stripTrailing());
    }

    private static void appendBlurInLine(StringBuilder sb, List<Word> line, int wordsPerLine,
                                          boolean uppercase, boolean cyrillic, boolean autoEmphasis,
                                          String baseColorAss, String highlightColorAss) {
        double start = line.get(0).start();
        double end = line.get(line.size() - 1).end();

        StringBuilder text = new StringBuilder("{\\blur6\\t(0,220,\\blur0)}");
        for (int i = 0; i < line.size(); i++) {
            Word w = line.get(i);
            String word = escape(display(w.text(), uppercase, cyrillic));
            boolean emphasized = autoEmphasis && isEmphasized(w.text());
            if (emphasized) {
                text.append("{\\c").append(highlightColorAss).append("\\b1}").append(word).append("{\\b0\\c").append(baseColorAss).append('}').append(' ');
            } else {
                text.append(word).append(' ');
            }
            if (wordsPerLine > 0 && (i + 1) % wordsPerLine == 0 && i < line.size() - 1) {
                text.append("\\N");
            }
        }
        appendDialogue(sb, start, end, text.toString().stripTrailing());
    }

    private static void appendDialogue(StringBuilder sb, double start, double end, String text) {
        sb.append("Dialogue: 0,").append(formatTime(start)).append(',').append(formatTime(end))
                .append(",Karaoke,,0,0,0,,").append(text).append('\n');
    }

    private static String formatTime(double seconds) {
        long totalCentiseconds = Math.round(Math.max(0, seconds) * 100);
        long hours = totalCentiseconds / 360000;
        long minutes = (totalCentiseconds / 6000) % 60;
        long secs = (totalCentiseconds / 100) % 60;
        long cs = totalCentiseconds % 100;
        return String.format("%d:%02d:%02d.%02d", hours, minutes, secs, cs);
    }

    /** ASS treats {, }, and \ as override-block syntax; a literal newline would break the Dialogue line. */
    private static String escape(String text) {
        return text.replace("\\", "\\\\").replace("{", "(").replace("}", ")")
                .replace("\n", " ").replace("\r", " ");
    }
}
