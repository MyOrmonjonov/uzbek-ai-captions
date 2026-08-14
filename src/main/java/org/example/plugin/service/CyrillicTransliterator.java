package org.example.plugin.service;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Deterministic Uzbek Latin-to-Cyrillic transliteration for the web tool's optional "Кириллга"
 * display toggle. Rule-based (no AI/dictionary lookup needed -- Uzbek Latin->Cyrillic is a
 * mostly regular letter-substitution problem), longest-sequence-first so digraphs like "sh"/
 * "ch"/apostrophe-vowels are matched before their component single letters. This is a display
 * transform only: it never touches the underlying Word.text() the transcript editor shows.
 *
 * Case handling is a simplification, not a full linguistic pass: an all-caps input word stays
 * all-caps, a capitalized word stays capitalized, everything else goes lowercase -- exact
 * per-letter case (e.g. camelCase) isn't preserved, which is an acceptable tradeoff for a
 * caption-display toggle.
 */
final class CyrillicTransliterator {

    // Longest sequences first so e.g. "sh" is consumed before a lone "s" or "h" would be.
    private static final Map<String, String> RULES = new LinkedHashMap<>();

    static {
        RULES.put("o'", "ў");
        RULES.put("oʻ", "ў");
        RULES.put("o‘", "ў");
        RULES.put("g'", "ғ");
        RULES.put("gʻ", "ғ");
        RULES.put("g‘", "ғ");
        RULES.put("sh", "ш");
        RULES.put("ch", "ч");
        RULES.put("ng", "нг");
        RULES.put("yo", "ё");
        RULES.put("yu", "ю");
        RULES.put("ya", "я");
        RULES.put("ye", "е");
        RULES.put("a", "а");
        RULES.put("b", "б");
        RULES.put("c", "ц");
        RULES.put("d", "д");
        RULES.put("e", "е");
        RULES.put("f", "ф");
        RULES.put("g", "г");
        RULES.put("h", "ҳ");
        RULES.put("i", "и");
        RULES.put("j", "ж");
        RULES.put("k", "к");
        RULES.put("l", "л");
        RULES.put("m", "м");
        RULES.put("n", "н");
        RULES.put("o", "о");
        RULES.put("p", "п");
        RULES.put("q", "қ");
        RULES.put("r", "р");
        RULES.put("s", "с");
        RULES.put("t", "т");
        RULES.put("u", "у");
        RULES.put("v", "в");
        RULES.put("x", "х");
        RULES.put("y", "й");
        RULES.put("z", "з");
        RULES.put("'", "ъ");
        RULES.put("ʻ", "ъ");
        RULES.put("‘", "ъ");
    }

    // Matches the longest rule keys first (sorted by length descending) as one alternation.
    private static final Pattern RULE_PATTERN;

    static {
        StringBuilder alternation = new StringBuilder();
        RULES.keySet().stream()
                .sorted((a, b) -> b.length() - a.length())
                .forEach(key -> {
                    if (alternation.length() > 0) {
                        alternation.append('|');
                    }
                    alternation.append(Pattern.quote(key));
                });
        RULE_PATTERN = Pattern.compile(alternation.toString(), Pattern.CASE_INSENSITIVE);
    }

    private CyrillicTransliterator() {
    }

    static String toCyrillic(String latinWord) {
        if (latinWord == null || latinWord.isEmpty()) {
            return latinWord;
        }
        String lower = latinWord.toLowerCase();
        StringBuilder result = new StringBuilder();
        Matcher m = RULE_PATTERN.matcher(lower);
        int last = 0;
        while (m.find()) {
            result.append(lower, last, m.start());
            result.append(RULES.get(m.group().toLowerCase()));
            last = m.end();
        }
        result.append(lower, last, lower.length());
        String cyrillic = result.toString();

        boolean isAllUpper = latinWord.equals(latinWord.toUpperCase()) && !latinWord.equals(latinWord.toLowerCase());
        boolean isCapitalized = !latinWord.isEmpty() && Character.isUpperCase(latinWord.charAt(0));
        if (isAllUpper) {
            return cyrillic.toUpperCase();
        }
        if (isCapitalized && !cyrillic.isEmpty()) {
            return Character.toUpperCase(cyrillic.charAt(0)) + cyrillic.substring(1);
        }
        return cyrillic;
    }
}
