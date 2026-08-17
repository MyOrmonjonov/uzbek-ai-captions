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
                    "&H00FFFFFF", "&H00F25ABF", "&H00000000", AnimationTemplate.KARAOKE_FILL),
            new KaraokeStyle("instagram", "Instagram", "Arial", 86, true,
                    "&H00FFFFFF", "&H008C1EE6", "&H00000000", AnimationTemplate.WORD_POP),
            new KaraokeStyle("youtube_red", "YouTube", "Arial", 82, true,
                    "&H00FFFFFF", "&H000000FF", "&H00000000", AnimationTemplate.KARAOKE_FILL),
            new KaraokeStyle("spotify", "Spotify", "Verdana", 82, true,
                    "&H00FFFFFF", "&H0054B91D", "&H00000000", AnimationTemplate.WORD_POP),
            new KaraokeStyle("electric_blue", "Electric", "Arial", 84, true,
                    "&H00FFFFFF", "&H00FF9900", "&H00000000", AnimationTemplate.KARAOKE_FILL),
            new KaraokeStyle("gold_luxury", "Luxury Gold", "Georgia", 80, true,
                    "&H00FFFFFF", "&H0037AFD4", "&H00000000", AnimationTemplate.WORD_POP),
            new KaraokeStyle("mint", "Mint", "Verdana", 82, true,
                    "&H00888888", "&H00DCFF96", "&H00000000", AnimationTemplate.KARAOKE_FILL),
            new KaraokeStyle("coral", "Coral", "Arial", 84, true,
                    "&H00FFFFFF", "&H00507FFF", "&H00000000", AnimationTemplate.WORD_POP),
            new KaraokeStyle("lime", "Lime", "Impact", 84, true,
                    "&H00FFFFFF", "&H0000FFBF", "&H00000000", AnimationTemplate.KARAOKE_FILL),
            new KaraokeStyle("cherry", "Cherry", "Arial", 86, true,
                    "&H00FFFFFF", "&H002814BE", "&H00000000", AnimationTemplate.WORD_POP),
            new KaraokeStyle("ocean", "Ocean", "Verdana", 82, true,
                    "&H00888888", "&H00D8B400", "&H00000000", AnimationTemplate.KARAOKE_FILL),
            new KaraokeStyle("sunshine", "Sunshine", "Impact", 84, true,
                    "&H00FFFFFF", "&H0000D6FF", "&H00000000", AnimationTemplate.WORD_POP),
            new KaraokeStyle("grape", "Grape", "Arial", 82, true,
                    "&H00FFFFFF", "&H00A82D6F", "&H00000000", AnimationTemplate.KARAOKE_FILL),
            new KaraokeStyle("rose_gold", "Rose Gold", "Georgia", 80, true,
                    "&H00FFFFFF", "&H00B8B4E8", "&H00000000", AnimationTemplate.WORD_POP),
            new KaraokeStyle("midnight", "Midnight", "Arial", 82, true,
                    "&H00FFFFFF", "&H00FF7850", "&H00000000", AnimationTemplate.KARAOKE_FILL),
            new KaraokeStyle("sirgalish", "Sirg'alish", "Arial", 82, true,
                    "&H00FFFFFF", "&H0000D7FF", "&H00000000", AnimationTemplate.SLIDE_IN),
            new KaraokeStyle("chinor", "Chinor", "Consolas", 78, false,
                    "&H00FFFFFF", "&H0000D7FF", "&H00000000", AnimationTemplate.TYPEWRITER),
            new KaraokeStyle("kocha", "Ko'cha", "Arial", 84, true,
                    "&H00FFFFFF", "&H00FF6EC7", "&H00000000", AnimationTemplate.COLOR_CYCLE),
            new KaraokeStyle("boron", "Bo'ron", "Impact", 84, true,
                    "&H00FFFFFF", "&H0000D7FF", "&H00000000", AnimationTemplate.SHAKE),
            new KaraokeStyle("zarba", "Zarba", "Impact", 88, true,
                    "&H00FFFFFF", "&H000000FF", "&H00000000", AnimationTemplate.PUNCH),
            new KaraokeStyle("tolqin", "To'lqin", "Arial", 82, true,
                    "&H00FFFFFF", "&H00FF9900", "&H00000000", AnimationTemplate.CASCADE),
            new KaraokeStyle("nafas", "Nafas", "Georgia", 78, false,
                    "&H00FFFFFF", "&H00D8B400", "&H00000000", AnimationTemplate.BLUR_IN),
            new KaraokeStyle("tun", "Tun", "Arial", 78, true,
                    "&H00FFFFFF", "&H0000D7FF", "&H00000000", AnimationTemplate.BOXED_FILL)
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
