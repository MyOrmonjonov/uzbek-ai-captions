package org.example.plugin.config;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.example.plugin.model.KaraokeStyle;
import org.example.plugin.model.KaraokeStyle.AnimationTemplate;

/**
 * Fixed list of karaoke caption presets (see KaraokeStyle's javadoc for what each field means).
 * Deliberately a small, hand-picked set rather than an attempt at "100 styles" — every preset
 * here is just a handful of values, so growing this list later costs nothing but a new entry;
 * the panel's style picker is driven entirely by GET /api/karaoke-styles, not a hardcoded list,
 * so adding a preset here is the only change needed to make it selectable.
 */
public final class KaraokeStylePresets {

    private static final List<KaraokeStyle> PRESETS = List.of(
            new KaraokeStyle("apple", "Apple", "Helvetica", 78, false,
                    "&H00CCCCCC", "&H00FFFFFF", "&H00000000", AnimationTemplate.WORD_POP),
            new KaraokeStyle("karaoke_classic", "Karaoke Klassik", "Arial", 82, true,
                    "&H00FFFFFF", "&H0000D7FF", "&H00000000", AnimationTemplate.KARAOKE_FILL),
            new KaraokeStyle("tiktok_bold", "TikTok Bold", "Arial", 88, true,
                    "&H00FFFFFF", "&H00B400FF", "&H00000000", AnimationTemplate.WORD_POP),
            new KaraokeStyle("mrbeast", "MrBeast", "Arial", 92, true,
                    "&H00FFFFFF", "&H00303BFF", "&H00000000", AnimationTemplate.WORD_POP),
            new KaraokeStyle("neon_cyan", "Neon", "Arial", 82, true,
                    "&H00888888", "&H00FF840A", "&H00000000", AnimationTemplate.KARAOKE_FILL),
            new KaraokeStyle("sunset", "Sunset", "Arial", 82, true,
                    "&H00FFFFFF", "&H000095FF", "&H00000000", AnimationTemplate.WORD_POP),
            new KaraokeStyle("royal_purple", "Royal", "Arial", 82, true,
                    "&H00FFFFFF", "&H00F25ABF", "&H00000000", AnimationTemplate.KARAOKE_FILL)
    );

    private static final Map<String, KaraokeStyle> BY_KEY = new LinkedHashMap<>();

    static {
        for (KaraokeStyle style : PRESETS) {
            BY_KEY.put(style.key(), style);
        }
    }

    private KaraokeStylePresets() {
    }

    public static List<KaraokeStyle> all() {
        return PRESETS;
    }

    public static KaraokeStyle byKey(String key) {
        return BY_KEY.get(key);
    }
}
