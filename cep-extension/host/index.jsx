// ExtendScript host code, shared by Premiere Pro (PPRO) and After Effects (AEFT).
// Dispatches on BridgeTalk.appName since the panel is registered for both hosts.

// Some ExtendScript engine versions ship without native JSON (community-reported for MOGRT
// scripting) — this minimal polyfill only needs to round-trip our own plain data (word arrays,
// MOGRT parameter objects), not handle arbitrary untrusted input.
if (typeof JSON === "undefined") {
    JSON = {};
    JSON.quoteJsonString = function (str) {
        return '"' + String(str)
            .replace(/\\/g, "\\\\")
            .replace(/"/g, '\\"')
            .replace(/\n/g, "\\n")
            .replace(/\r/g, "\\r")
            .replace(/\t/g, "\\t") + '"';
    };
    JSON.stringify = function (value) {
        var t = typeof value;
        if (value === null || value === undefined) {
            return "null";
        }
        if (t === "number" || t === "boolean") {
            return String(value);
        }
        if (t === "string") {
            return JSON.quoteJsonString(value);
        }
        if (value instanceof Array) {
            var arrParts = [];
            for (var i = 0; i < value.length; i++) {
                arrParts.push(JSON.stringify(value[i]));
            }
            return "[" + arrParts.join(",") + "]";
        }
        if (t === "object") {
            var objParts = [];
            for (var key in value) {
                if (value.hasOwnProperty(key)) {
                    objParts.push(JSON.quoteJsonString(key) + ":" + JSON.stringify(value[key]));
                }
            }
            return "{" + objParts.join(",") + "}";
        }
        return "null";
    };
    JSON.parse = function (text) {
        return eval("(" + text + ")");
    };
}

// Remembers what insertKineticText()/insertCaptionMogrt() placed last, so trying a different
// style or duration setting replaces the previous overlay instead of stacking a second copy on
// top of it — without this, every "try another style" click just piled up more MOGRT clips.
// Module-level vars persist for as long as this .jsx stays loaded in Premiere (i.e. across
// evalScript calls in the same session), which is exactly the lifetime needed here.
var lastKineticClips = [];
var lastKineticTrackIndices = [];
var lastCaptionClips = [];
var lastCaptionTrackIndices = [];

// Placing MOGRT clips one at a time (a real Premiere import + track placement per word/cue) has
// real, unavoidable per-item cost — there's no bulk API for it, so a long video's word list
// takes visibly longer than an instant UI toggle. That time can't be removed, but the panel can
// at least show live progress instead of one long silent freeze. CSXSEvent is CEP's documented
// mechanism for an ExtendScript host to push an event to the panel mid-script (the
// PlugPlugExternalObject library backs it and must be loaded once before first use).
var _progressLibLoaded = false;
function dispatchProgress(kind, done, total) {
    try {
        if (!_progressLibLoaded) {
            new ExternalObject("lib:PlugPlugExternalObject");
            _progressLibLoaded = true;
        }
        var evt = new CSXSEvent();
        evt.type = "com.uzbekaicaptions.mogrtProgress";
        evt.data = JSON.stringify({ kind: kind, done: done, total: total });
        evt.dispatch();
    } catch (e) {
        // progress reporting is a nice-to-have; never let it break the actual placement work
    }
}

/** Removes every clip in `clips` (best-effort — a clip the user deleted by hand is skipped, not fatal) and empties the array. */
function clearTrackedClips(clips) {
    for (var i = 0; i < clips.length; i++) {
        try {
            clips[i].remove(false, false);
        } catch (e) {
            // already gone (e.g. user deleted it manually) — nothing to clean up
        }
    }
    clips.length = 0;
}

/** After Effects: the active composition, if app.project.activeItem is one (null otherwise). */
function _ae_findActiveComp() {
    try {
        var item = app.project.activeItem;
        if (item instanceof CompItem) {
            return item;
        }
    } catch (e) {
        // no active item, or activeItem isn't a comp
    }
    return null;
}

/**
 * Lists every sequence in the currently open Premiere project, for the panel's sequence picker.
 * A project with several sequences otherwise has no way to say which one should get captioned
 * besides whatever Premiere itself currently considers "active" -- easy to get wrong if a user
 * has more than one open and isn't sure which tab is actually focused. After Effects has no
 * equivalent concept here (a composition, not a sequence), matching getActiveMediaPath's own
 * AE/Premiere split -- returns an empty list there, so the panel's picker just stays hidden.
 * Returns a JSON array of {index, name}, or an "ERROR: ..." string.
 */
function listSequences() {
    try {
        if (BridgeTalk.appName !== "premierepro") {
            return "[]";
        }
        if (!app.project) {
            return "ERROR: Premiere'da ochiq loyiha topilmadi.";
        }
        var result = [];
        for (var i = 0; i < app.project.sequences.numSequences; i++) {
            result.push({ index: i, name: app.project.sequences[i].name });
        }
        return JSON.stringify(result);
    } catch (e) {
        return "ERROR: " + e.toString();
    }
}

/**
 * Switches Premiere's own "active sequence" to the one at this index in app.project.sequences
 * -- every other function in this file reads app.project.activeSequence, so this is what makes
 * the panel's picker actually control which sequence subsequent actions (transcribe, karaoke
 * burn, kinetic overlay, B-roll) apply to, regardless of which tab happens to be focused inside
 * Premiere itself.
 */
function setActiveSequenceByIndex(index) {
    try {
        if (BridgeTalk.appName !== "premierepro" || !app.project) {
            return "ERROR: Faqat Premiere Pro'da qo'llab-quvvatlanadi.";
        }
        var seq = app.project.sequences[index];
        if (!seq) {
            return "ERROR: Sequence topilmadi.";
        }
        app.project.activeSequence = seq;
        return "OK";
    } catch (e) {
        return "ERROR: " + e.toString();
    }
}

function getActiveMediaPath() {
    try {
        if (BridgeTalk.appName === "aftereffects") {
            var comp = _ae_findActiveComp();
            if (!comp) {
                return "ERROR: Faol kompozitsiya topilmadi. Avval bir kompozitsiyani oching (Project panelida ustiga ikki marta bosing).";
            }
            // AE has no single "source media path" the way a Premiere sequence clip does — the
            // active composition's name is used purely for display + as a non-empty "a target
            // exists" signal; audio comes from exportActiveSequenceAudio() rendering the comp
            // directly, not from scanning for a source file.
            return comp.name;
        }
        if (BridgeTalk.appName !== "premierepro") {
            return "ERROR: Faqat Premiere Pro yoki After Effects'da qo'llab-quvvatlanadi.";
        }
        if (!app.project) {
            return "ERROR: Premiere'da ochiq loyiha topilmadi.";
        }
        var sequence = app.project.activeSequence;
        if (!sequence) {
            return "ERROR: Ochiq sequence (timeline) topilmadi. Avval bir sequence oching.";
        }
        // Used to walk every clip on every track and resolve each one's actual source file via
        // clip.projectItem.getMediaPath() — an ExtendScript-bridge call per clip, which on a
        // timeline carrying kinetic typography's word-per-clip overlay tracks (easily hundreds
        // of .mogrt clips) made this check visibly slow. The resolved path hasn't been needed
        // since audio started coming from exportActiveSequenceAudio() (rendering the sequence
        // itself, not a located source file) — same reasoning the AE branch above already
        // follows (comp.name, no scan). Only a cheap "is there anything on the timeline at all"
        // presence check remains, using clips.numItems (no per-clip resolution).
        var hasAnyClip = false;
        for (var t = 0; t < sequence.videoTracks.numTracks && !hasAnyClip; t++) {
            if (sequence.videoTracks[t].clips.numItems > 0) {
                hasAnyClip = true;
            }
        }
        if (!hasAnyClip) {
            return "ERROR: Timeline'da video topilmadi. Avval sequence'ga video qo'shing.";
        }
        return sequence.name;
    } catch (e) {
        return "ERROR: " + e.toString();
    }
}

/**
 * Duration of the main video track's actual content (last clip's end, in seconds) — used by the
 * panel to trim transcription results that run past the real video, since
 * exportActiveSequenceAudio() exports the entire sequence (its duration is driven by the latest
 * clip on ANY track, so leftover clips elsewhere can make the exported audio — and therefore any
 * generated subtitles — longer than the actual video). Premiere only; returns "0" for AE or on
 * any failure, which callers treat as "don't trim".
 */
function getMainVideoDurationSeconds() {
    try {
        if (BridgeTalk.appName !== "premierepro" || !app.project || !app.project.activeSequence) {
            return "0";
        }
        var track = app.project.activeSequence.videoTracks[0];
        var maxEnd = 0;
        for (var i = 0; i < track.clips.numItems; i++) {
            var end = track.clips[i].end.seconds;
            if (end > maxEnd) {
                maxEnd = end;
            }
        }
        return String(maxEnd);
    } catch (e) {
        return "0";
    }
}

function importSrt(srtPath, sourceMediaPath, mogrtFolder) {
    try {
        if (BridgeTalk.appName === "premierepro") {
            // Routed through Premiere's native Captions import (importSrtPremiere), not the
            // MOGRT path, per a direct comparison against a competitor plugin whose plain
            // subtitles land correctly every time: it does the same thing (import the SRT,
            // place it via native captions) instead of hand-placing a MOGRT clip per cue.
            // insertCaptionMogrt() (still used, unrelated, for kinetic typography's per-word
            // clips) is left in place but no longer reachable from this entry point — the
            // trade-off (Premiere re-wraps lines by its own rules, ignoring maxLines/
            // wordsPerLine, and caption font/color isn't scriptable) was made knowingly.
            return importSrtPremiere(srtPath, sourceMediaPath);
        } else if (BridgeTalk.appName === "aftereffects") {
            return importSrtAfterEffects(srtPath);
        }
        return "ERROR: Noma'lum dastur: " + BridgeTalk.appName;
    } catch (e) {
        return "ERROR: " + e.toString();
    }
}

/**
 * Finds the timeline clip whose source media matches mediaPath and returns the sequence
 * time (in seconds) that corresponds to time 0 of that source file. Subtitles are
 * transcribed from the whole source file, so this is the offset the caption clip needs to
 * be inserted at for its cues to land on the same frames as the audio they were built from
 * — not just "0", which only happens to be correct when the clip starts at the very
 * beginning of the timeline with no in-point trim.
 */
function findSourceTimeZeroOffset(sequence, mediaPath) {
    for (var t = 0; t < sequence.videoTracks.numTracks; t++) {
        var track = sequence.videoTracks[t];
        for (var c = 0; c < track.clips.numItems; c++) {
            var clip = track.clips[c];
            if (clip.projectItem && clip.projectItem.getMediaPath() === mediaPath) {
                return clip.start.seconds - clip.inPoint.seconds;
            }
        }
    }
    return null;
}

/**
 * After Effects: renders the active composition's audio through the render queue (there's no
 * AE equivalent of Premiere's exportAsMediaDirect() — the render queue is the documented way to
 * export audio-only from a comp). Tries a few built-in output-module templates since which ones
 * exist depends on the AE version/install; the queue item is removed again afterward either way,
 * and any other pending queue items are temporarily disabled so only this composition renders.
 */
function _ae_exportActiveCompAudio(outputPath) {
    var comp = _ae_findActiveComp();
    if (!comp) {
        return "ERROR: Faol kompozitsiya topilmadi. Avval bir kompozitsiyani oching.";
    }
    try {
        var outFile = new File(outputPath);
        if (outFile.exists) {
            try { outFile.remove(); } catch (eRemove) {}
        }

        var rq = app.project.renderQueue;
        var rqItem = rq.items.add(comp);
        var om = rqItem.outputModule(1);
        var templates = ["WAV", "AIFF 48kHz", "AIFF", "Audio Only", "MP3"];
        var applied = false;
        for (var t = 0; t < templates.length; t++) {
            try { om.applyTemplate(templates[t]); applied = true; break; } catch (eTemplate) {}
        }
        if (!applied) {
            try { rqItem.remove(); } catch (eRq) {}
            return "ERROR: AE audio chiqish shabloni topilmadi (WAV/AIFF). Output Module sozlamasini tekshiring.";
        }
        try { om.file = new File(outputPath); } catch (eFile) {}

        // Only this composition should render — everything else already queued is disabled for
        // the duration, then restored, so a user's own pending render jobs aren't disturbed.
        var previouslyEnabled = [];
        for (var r = 1; r <= rq.numItems; r++) {
            var item = rq.item(r);
            if (item !== rqItem) {
                previouslyEnabled.push([item, item.render]);
                try { item.render = false; } catch (eDisable) {}
            }
        }
        try { rqItem.render = true; } catch (eEnable) {}
        rq.render();
        for (var p = 0; p < previouslyEnabled.length; p++) {
            try { previouslyEnabled[p][0].render = previouslyEnabled[p][1]; } catch (eRestore) {}
        }
        try { rqItem.remove(); } catch (eCleanup) {}

        // AE's chosen template can end up with a different extension than requested (e.g. AIFF
        // instead of WAV) — find whatever actually got written next to the requested name.
        var real = new File(outputPath);
        if (!real.exists) {
            var dot = outputPath.lastIndexOf(".");
            var base = dot > -1 ? outputPath.substring(0, dot) : outputPath;
            var baseFile = new File(base);
            var dir = baseFile.parent;
            var baseName = baseFile.name;
            var candidates = dir.getFiles(function (f) {
                return (f instanceof File) && f.name.indexOf(baseName) === 0;
            });
            if (candidates && candidates.length) {
                real = candidates[0];
            }
        }
        if (!real.exists) {
            return "ERROR: Audio yaratilmadi. AE audio shabloni topilmadi.";
        }
        return real.fsName;
    } catch (e) {
        return "ERROR: " + e.toString();
    }
}

/**
 * Exports the active sequence's (or, in After Effects, composition's) audio directly via the
 * host app's own render pipeline (Sequence.exportAsMediaDirect() in Premiere, the render queue
 * in After Effects — see _ae_exportActiveCompAudio()) instead of transcribing the raw source
 * media file and computing where it sits on the timeline afterwards
 * (findSourceTimeZeroOffset(), above) — a source of repeated offset bugs across several past
 * sessions (wrong track, trimmed in-point, multiple clips of the same source). Exporting from
 * the sequence/comp itself means the resulting WAV already starts at its own time zero, so
 * every downstream word/cue timestamp lines up with the timeline with no offset math needed at
 * all — callers should pass an empty sourceMediaPath to importSrt()/insertKineticText()/
 * insertCaptionMogrt() when the audio came from this function.
 */
function exportActiveSequenceAudio(outputPath, presetPath) {
    try {
        if (BridgeTalk.appName === "aftereffects") {
            return _ae_exportActiveCompAudio(outputPath);
        }
        if (BridgeTalk.appName !== "premierepro") {
            return "ERROR: Bu funksiya faqat Premiere Pro yoki After Effects'da qo'llab-quvvatlanadi.";
        }
        if (!app.project) {
            return "ERROR: Premiere'da ochiq loyiha topilmadi.";
        }
        var sequence = app.project.activeSequence;
        if (!sequence) {
            return "ERROR: Ochiq sequence (timeline) topilmadi. Avval bir sequence oching.";
        }
        var presetFile = new File(presetPath);
        if (!presetFile.exists) {
            return "ERROR: Audio eksport shabloni topilmadi (" + presetPath + ").";
        }
        var outFile = new File(outputPath);
        if (outFile.exists) {
            try { outFile.remove(); } catch (eRemove) {}
        }

        // exportAsMediaDirect requires OS-native path separators ("C:\..." on Windows) — a
        // forward-slash path silently produces "Unknown Error" on Windows (community-reported,
        // consistent with other native-path quirks already worked around elsewhere in this file).
        var result = sequence.exportAsMediaDirect(outFile.fsName, presetFile.fsName, 0);
        var check = new File(outputPath);
        if (!check.exists) {
            return "ERROR: Audio yaratilmadi. Natija: " + String(result);
        }
        return outputPath;
    } catch (e) {
        return "ERROR: " + e.toString();
    }
}

/**
 * Renders the active sequence to a video file (Premiere only for v1 — After Effects has no
 * equivalent "sequence" render path; it renders compositions through the render queue instead,
 * which needs its own separate implementation). Structurally identical to
 * exportActiveSequenceAudio() above (exportAsMediaDirect doesn't care whether the preset it's
 * given targets audio or video), kept as its own function rather than a shared parameter because
 * the two need different error messages and different AE handling.
 */
function exportActiveSequenceVideo(outputPath, presetPath) {
    try {
        if (BridgeTalk.appName !== "premierepro") {
            return "ERROR: Karaoke video eksporti hozircha faqat Premiere Pro'da ishlaydi.";
        }
        if (!app.project) {
            return "ERROR: Premiere'da ochiq loyiha topilmadi.";
        }
        var sequence = app.project.activeSequence;
        if (!sequence) {
            return "ERROR: Ochiq sequence (timeline) topilmadi. Avval bir sequence oching.";
        }
        var presetFile = new File(presetPath);
        if (!presetFile.exists) {
            return "ERROR: Video eksport shabloni topilmadi (" + presetPath + ").";
        }
        var outFile = new File(outputPath);
        if (outFile.exists) {
            try { outFile.remove(); } catch (eRemove) {}
        }
        var result = sequence.exportAsMediaDirect(outFile.fsName, presetFile.fsName, 0);
        var check = new File(outputPath);
        if (!check.exists) {
            return "ERROR: Video yaratilmadi. Natija: " + String(result);
        }
        return outputPath;
    } catch (e) {
        return "ERROR: " + e.toString();
    }
}

/** Imports the finished karaoke video into the project bin (not placed on the timeline —
 * unlike captions/B-roll this is a whole rendered clip, so where it belongs is the user's call). */
function importKaraokeVideo(videoPath) {
    try {
        if (!app.project) {
            return "ERROR: Loyiha topilmadi.";
        }
        var item = importSingleFile(videoPath);
        if (!item) {
            return "ERROR: Video loyihaga import qilinmadi.";
        }
        return "OK";
    } catch (e) {
        return "ERROR: " + e.toString();
    }
}

// Track.overwriteClip()'s "time" parameter is documented as a String in ticks, not seconds
// — passing raw seconds (e.g. "12.5") silently resolves to ~0, which is why clips always
// landed at the very start of the track instead of at the requested offset.
var TICKS_PER_SECOND = 254016000000;
function secondsToTicksString(seconds) {
    return Math.round(seconds * TICKS_PER_SECOND).toString();
}

/** Recursively records every project item's nodeId (bins included) into `ids`. */
function collectProjectItemIds(item, ids) {
    ids[item.nodeId] = true;
    try {
        if (item.children) {
            for (var i = 0; i < item.children.numItems; i++) {
                collectProjectItemIds(item.children[i], ids);
            }
        }
    } catch (e) {
        // non-bin items don't expose .children — nothing more to walk here
    }
}

/** Recursively finds the first project item whose nodeId isn't in `beforeIds`. */
function findNewProjectItem(item, beforeIds) {
    if (!beforeIds[item.nodeId]) {
        return item;
    }
    try {
        if (item.children) {
            for (var i = 0; i < item.children.numItems; i++) {
                var found = findNewProjectItem(item.children[i], beforeIds);
                if (found) {
                    return found;
                }
            }
        }
    } catch (e) {
        // ignore — see collectProjectItemIds
    }
    return null;
}

/**
 * Imports a single file into the project and returns the newly created project item, by
 * diffing the whole project tree before/after the import (Premiere's importFiles doesn't hand
 * back the resulting item directly). Walks the full tree, not just rootItem's direct children —
 * some file types (e.g. .mogrt) get auto-filed into a bin Premiere creates on the fly rather
 * than landing at the root. Returns null if no new item appeared.
 */
function importSingleFile(path) {
    var beforeIds = {};
    collectProjectItemIds(app.project.rootItem, beforeIds);

    app.project.importFiles([path]);

    return findNewProjectItem(app.project.rootItem, beforeIds);
}

/**
 * Adds a new empty video track if the (undocumented) QE API is available, and returns its
 * index (see the position-detection note inside); otherwise falls back to the last existing
 * track. Putting overlays on their own fresh track means we never need to touch whatever the
 * user already has on the other video tracks.
 */
function addOverlayTrack(sequence) {
    var tracksBefore = sequence.videoTracks.numTracks;
    var trackIndex = tracksBefore - 1;
    var addedNewTrack = false;
    try {
        app.enableQE();
        var qeSequence = qe.project.getActiveSequence();
        // Video tracks composite with higher indices in front of lower ones (index 0 = bottom
        // = background), so the insertion index (2nd arg) is set to tracksBefore to explicitly
        // ask for the new track at the top — otherwise overlay content could end up compositing
        // behind the user's existing video instead of over it.
        qeSequence.addTracks(1, tracksBefore, 0, 0, 0, 0);
        if (sequence.videoTracks.numTracks > tracksBefore) {
            addedNewTrack = true;
            // QE's insertion-index parameter isn't reliably documented, so confirm which index
            // actually ended up empty instead of trusting the requested position blindly — an
            // existing project's video track is almost never already empty, so an empty track
            // right after adding one is a strong signal for where it landed.
            if (sequence.videoTracks[tracksBefore].clips.numItems === 0) {
                trackIndex = tracksBefore;
            } else if (sequence.videoTracks[0].clips.numItems === 0) {
                trackIndex = 0;
            } else {
                trackIndex = tracksBefore;
            }
        }
    } catch (eQE) {
        // QE API unavailable in this Premiere version — fall back to the last existing track.
    }
    return { trackIndex: trackIndex, addedNewTrack: addedNewTrack };
}

/**
 * Imports the SRT into the project bin, then places it on its own overlay track automatically
 * via overwriteClip() (not insertClip() — that ripples every later clip on every track, which
 * previously pushed the user's actual video out of place).
 *
 * This used to require a manual drag from the Project panel instead — that caution turned out
 * to be unwarranted: the "subtitle is wrong" reports that motivated it were actually (a) a
 * PowerShell install bug leaving a stale, unrelated MOGRT build running, and (b) the sequence
 * genuinely being longer than the source video file (confirmed correct — the generated SRT's
 * own duration matched the *sequence's* duration exactly). With the underlying SRT content and
 * timing now independently verified correct, there's no remaining reason to believe
 * overwriteClip() placement (already relied on elsewhere — kinetic typography, B-roll) would
 * behave any differently here.
 */
function importSrtPremiere(srtPath, sourceMediaPath) {
    if (!app.project) {
        return "ERROR: Premiere'da ochiq loyiha topilmadi.";
    }
    var sequence = app.project.activeSequence;
    if (!sequence) {
        return "ERROR: Ochiq sequence (timeline) topilmadi. Avval bir sequence oching.";
    }

    var importedItem = importSingleFile(srtPath);
    if (!importedItem) {
        return "ERROR: Import qilingan subtitr fayli topilmadi.";
    }

    // Subtitle timestamps are relative to the sequence's own time zero (audio is exported
    // straight from the sequence, not a located source file — see
    // exportSequenceAudioForTranscribe() in main.js), so offsetSeconds is always 0 here; kept
    // as a variable (rather than hardcoding 0 below) only in case sourceMediaPath is ever
    // passed again in the future.
    var offsetSeconds = 0;
    if (sourceMediaPath) {
        var found = findSourceTimeZeroOffset(sequence, sourceMediaPath);
        if (found !== null) {
            offsetSeconds = Math.max(0, found);
        }
    }

    // Regenerating (new "Subtitr yaratish" run) replaces the previously placed caption clip
    // instead of stacking a second one on a second new track.
    clearTrackedClips(lastCaptionClips);

    try {
        var overlay = addOverlayTrack(sequence);
        sequence.videoTracks[overlay.trackIndex].overwriteClip(importedItem, secondsToTicksString(offsetSeconds));
        var placedClip = sequence.videoTracks[overlay.trackIndex].clips[sequence.videoTracks[overlay.trackIndex].clips.numItems - 1];
        if (placedClip) {
            lastCaptionClips.push(placedClip);
        }
        return "Subtitr videoga moslab, alohida track'ga avtomatik qo'shildi.";
    } catch (e) {
        try {
            importedItem.select(true);
        } catch (eSelect) {
            // selection is a nice-to-have; import already succeeded either way
        }
        return "Subtitr loyihaga import qilindi, lekin Timeline'ga avtomatik qo'yib bo'lmadi (" + e.toString() +
            "). Project paneldan uni Timeline'ning ENG BOSHIGA (0-sekundga) sudrab tashlang.";
    }
}

// Regenerating (new subtitle run) replaces the previous caption layers instead of stacking a
// second set on top — same reasoning as lastCaptionClips/clearTrackedClips for Premiere, just
// with AE's own removal API (a layer's .remove(), not a TrackItem's).
var lastAeCaptionLayers = [];

function clearTrackedLayers(layers) {
    for (var i = 0; i < layers.length; i++) {
        try {
            layers[i].remove();
        } catch (e) {
            // already gone (e.g. user deleted it manually) — nothing to clean up
        }
    }
    layers.length = 0;
}

/** Parses a "#rrggbb" string into AE's [r,g,b] 0-1 array form; returns `fallback` for anything
 * that isn't exactly that shape (missing/malformed panel input shouldn't throw, just fall back
 * to the caller's default color). */
function _ae_hexToRgb01(hex, fallback) {
    try {
        var m = /^#?([0-9a-fA-F]{6})$/.exec(String(hex || ""));
        if (!m) {
            return fallback;
        }
        var n = parseInt(m[1], 16);
        return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
    } catch (e) {
        return fallback;
    }
}

/**
 * Applies our caption/kinetic-typography text look (bold fill + stroke, sized relative to the
 * comp's shorter dimension so it reads well in both landscape and portrait/vertical comps) —
 * shared by importSrtAfterEffects() (per-cue captions) and _ae_insertKineticText() (per-word
 * kinetic bursts, below) so the two styles can't drift apart. `style` is optional — omitted for
 * captions (keeps their fixed white-on-black look), passed by the kinetic path so the panel's
 * font/color pickers (see index.html's #kinetic-font-select etc.) take effect there.
 */
function _ae_styleTextLayer(textLayer, comp, sizeRatio, style) {
    style = style || {};
    try {
        var sourceTextProp = textLayer.property("Source Text");
        var textDoc = sourceTextProp.value;
        textDoc.resetCharStyle();
        try {
            textDoc.font = style.font || "Arial-BoldMT";
        } catch (eFont) {
            try { textDoc.fontFamily = "Arial"; textDoc.fontStyle = "Bold"; } catch (eFont2) {}
        }
        var fontSize = Math.round(Math.min(comp.width, comp.height) * sizeRatio);
        textDoc.fontSize = fontSize;
        textDoc.applyFill = true;
        textDoc.fillColor = _ae_hexToRgb01(style.color, [1, 1, 1]);
        textDoc.applyStroke = true;
        textDoc.strokeColor = _ae_hexToRgb01(style.strokeColor, [0, 0, 0]);
        textDoc.strokeWidth = Math.max(2, Math.round(fontSize * 0.09));
        textDoc.strokeOverFill = false;
        textDoc.justification = ParagraphJustification.CENTER_JUSTIFY;
        sourceTextProp.setValue(textDoc);
    } catch (eStyle) {}
}

/**
 * Adds one text layer per cue directly into the active composition (not a separate new comp the
 * user would have to manually composite in) — matches Premiere's overlay-track approach and,
 * more importantly, matches what a caption actually needs to be: layered on top of the video the
 * user is already looking at, correctly sized/positioned/styled for it, not a disconnected extra
 * comp.
 */
function importSrtAfterEffects(srtPath) {
    var srtFile = new File(srtPath);
    if (!srtFile.exists) {
        return "ERROR: SRT fayl topilmadi: " + srtPath;
    }

    var comp = _ae_findActiveComp();
    if (!comp) {
        return "ERROR: Faol kompozitsiya topilmadi. Avval bir kompozitsiyani oching.";
    }

    var cues = parseSrt(srtFile);
    if (cues.length === 0) {
        return "ERROR: SRT faylda subtitr topilmadi.";
    }

    clearTrackedLayers(lastAeCaptionLayers);

    app.beginUndoGroup("Ravon Captions - subtitr");
    try {
        var added = 0;
        // Natural speech always has a small pause between cues — holding each cue on screen
        // until the next one starts (rather than cutting exactly at its own end) avoids a
        // constant flicker, same reasoning as the Premiere overlay tracks' hold-until-next-word
        // logic. Only small gaps are closed; a long silence still just ends the cue normally.
        var GAP_CLOSE_SECONDS = 2.0;

        for (var i = 0; i < cues.length; i++) {
            var cue = cues[i];
            var start = Math.max(0, Math.min(cue.start, comp.duration));
            var end = Math.max(start + 0.1, Math.min(cue.end, comp.duration));
            if (i + 1 < cues.length) {
                var nextStart = Math.min(cues[i + 1].start, comp.duration);
                if (nextStart > end && (nextStart - end) <= GAP_CLOSE_SECONDS) {
                    end = nextStart;
                }
            }

            var textLayer = comp.layers.addText(cue.text);
            lastAeCaptionLayers.push(textLayer);
            try {
                textLayer.startTime = 0;
                textLayer.inPoint = start;
                textLayer.outPoint = end;
            } catch (eTime) {}

            _ae_styleTextLayer(textLayer, comp, 0.05);

            try {
                var rect = textLayer.sourceRectAtTime(start, false);
                var anchorX = rect.left + rect.width / 2;
                var anchorY = rect.top + rect.height / 2;
                textLayer.property("Transform").property("Anchor Point").setValue([anchorX, anchorY]);
                textLayer.property("Transform").property("Position").setValue(
                    [comp.width / 2, Math.round(comp.height * 0.85)]);
            } catch (ePosition) {
                try {
                    textLayer.property("Transform").property("Position").setValue(
                        [comp.width / 2, Math.round(comp.height * 0.85)]);
                } catch (ePosition2) {}
            }

            added++;
        }

        return added + "/" + cues.length + " ta subtitr '" + comp.name + "' kompozitsiyasiga qo'shildi.";
    } finally {
        app.endUndoGroup();
    }
}

function insertBroll(mediaPath, startSeconds, endSeconds) {
    try {
        if (BridgeTalk.appName !== "premierepro") {
            return "ERROR: B-roll qo'shish faqat Premiere Pro'da qo'llab-quvvatlanadi.";
        }
        if (!app.project) {
            return "ERROR: Premiere'da ochiq loyiha topilmadi.";
        }
        var sequence = app.project.activeSequence;
        if (!sequence) {
            return "ERROR: Ochiq sequence (timeline) topilmadi. Avval bir sequence oching.";
        }

        var mediaFile = new File(mediaPath);
        if (!mediaFile.exists) {
            return "ERROR: Video fayl topilmadi: " + mediaPath;
        }

        var importedItem = importSingleFile(mediaPath);
        if (!importedItem) {
            return "ERROR: Import qilingan video topilmadi.";
        }

        var overlay = addOverlayTrack(sequence);
        var trackIndex = overlay.trackIndex;
        var usedNewTrack = overlay.addedNewTrack;

        // overwriteClip, not insertClip — insertClip ripples (shifts) everything after it on
        // synced tracks, which would push the user's existing timeline content out of place.
        sequence.videoTracks[trackIndex].overwriteClip(importedItem, secondsToTicksString(startSeconds));

        var insertedClip = null;
        var clips = sequence.videoTracks[trackIndex].clips;
        for (var c = 0; c < clips.numItems; c++) {
            if (Math.abs(clips[c].start.seconds - startSeconds) < 0.1) {
                insertedClip = clips[c];
                break;
            }
        }

        var duration = endSeconds - startSeconds;
        if (insertedClip && duration > 0 && (insertedClip.end.seconds - insertedClip.start.seconds) > duration) {
            try {
                var newEnd = new Time();
                newEnd.seconds = startSeconds + duration;
                insertedClip.end = newEnd;
            } catch (eTrim) {
                // best-effort trim; leave the clip at its native length if this fails
            }
        }

        if (usedNewTrack) {
            return "B-roll yangi track'ga qo'shildi (" + startSeconds.toFixed(1) + "s).";
        }
        return "B-roll qo'shildi (" + startSeconds.toFixed(1) + "s). Yangi track avtomatik yaratilmadi, mavjud oxirgi track ishlatildi.";
    } catch (e) {
        return "ERROR: " + e.toString();
    }
}

// Style names are just the .mogrt filenames (without extension) found in the assets folder at
// runtime — dropping in an extra matching-structure .mogrt file is enough to make it selectable
// in the panel, no code change needed. Restricted to a safe charset since it becomes part of a
// filesystem path.
var KINETIC_STYLE_NAME_RE = /^[A-Za-z0-9_\-]+$/;

// The mogrt folder path is resolved on the panel (JS) side via CSInterface's
// getSystemPath(SystemPath.EXTENSION) and passed into every kinetic-typography call — ExtendScript's
// own $.fileName does not reliably resolve to this .jsx file's location once it's loaded as a CEP
// host script, so it can't be used to find the extension's own install folder from here.
function getMogrtPath(style, mogrtFolder) {
    if (!style || !KINETIC_STYLE_NAME_RE.test(style)) {
        return null;
    }
    return mogrtFolder + "/" + style + ".mogrt";
}

/** Lists the kinetic-typography styles currently available (one per .mogrt file), for the panel to populate its style picker. */
function listKineticStyles(mogrtFolder) {
    try {
        var folder = new Folder(mogrtFolder);
        if (!folder.exists) {
            return "[]";
        }
        var files = folder.getFiles("*.mogrt");
        var names = [];
        for (var i = 0; i < files.length; i++) {
            names.push(files[i].name.replace(/\.mogrt$/i, ""));
        }
        names.sort();
        return JSON.stringify(names);
    } catch (e) {
        return "[]";
    }
}

/**
 * Sets the text of a placed MOGRT clip instance. Premiere doesn't expose a "Source Text"
 * property by name — the Essential Graphics text field is one of the clip's MGT component
 * params, stored as a JSON string with a "textEditValue" key (confirmed pattern from Adobe's
 * scripting community, since this isn't in the official docs). We scan all params for that
 * shape rather than a fixed display name, since the name depends on what the .mogrt author
 * called the layer/property in After Effects.
 */
function setMogrtText(clip, text) {
    try {
        var component = clip.getMGTComponent();
        if (!component) {
            return false;
        }
        var updatedAny = false;
        for (var i = 0; i < component.properties.numItems; i++) {
            var param = component.properties[i];
            var raw;
            try {
                raw = param.getValue();
            } catch (eGet) {
                continue;
            }
            if (typeof raw !== "string" || raw.indexOf("textEditValue") === -1) {
                continue;
            }
            var parsed;
            try {
                parsed = JSON.parse(raw);
            } catch (eParse) {
                continue;
            }
            if (!parsed || typeof parsed.textEditValue === "undefined") {
                continue;
            }
            parsed.textEditValue = text;
            parsed.fontTextRunLength = [text.length];
            // These MOGRT templates were authored with the "All Caps" character style baked
            // into the text param itself (confirmed in definition.json:
            // capParams[0].fontFSAllCapsValue === [true]) — Premiere renders our lowercase/
            // mixed-case word or cue text as all-caps regardless of what textEditValue holds,
            // since that's a separate style flag on the same param, not part of the text
            // content. Turning it off here (only when the param actually has this key) makes
            // the rendered case match what we actually sent.
            if (typeof parsed.fontFSAllCapsValue !== "undefined") {
                parsed.fontFSAllCapsValue = [false];
            }
            param.setValue(JSON.stringify(parsed), true);
            // Some .mogrt exports carry more than one text-shaped param (e.g. one per text
            // run/style) — updating only the first one left the others (and the on-screen
            // render) showing the original placeholder, so every match gets updated, not just
            // the first.
            updatedAny = true;
        }
        return updatedAny;
    } catch (e) {
        return false;
    }
}

/**
 * Diagnostic-only readback for the first kinetic word: setMogrtText() has twice now been
 * reported as "succeeding" (finds a textEditValue param, calls setValue with no exception) while
 * Premiere still rendered the MOGRT's own placeholder ("Your text") instead of the real word.
 * Without a debugger attached to the ExtendScript engine, the only way to see whether that's a
 * write that silently didn't stick vs. a write that stuck but never got rendered is to re-read
 * the property fresh right after and report what's actually in it — surfaced in the panel's
 * result message so the next real test tells us which of the two it is.
 */
function setMogrtTextDiagnostic(clip, expectedText) {
    try {
        var component = clip.getMGTComponent();
        if (!component) {
            return "diagnostika: MGT komponent topilmadi";
        }
        var matched = 0;
        var readback = [];
        for (var i = 0; i < component.properties.numItems; i++) {
            var raw;
            try {
                raw = component.properties[i].getValue();
            } catch (eGet) {
                continue;
            }
            if (typeof raw !== "string" || raw.indexOf("textEditValue") === -1) {
                continue;
            }
            matched++;
            try {
                readback.push(String(JSON.parse(raw).textEditValue));
            } catch (eParse) {
                readback.push("?");
            }
        }
        return "diagnostika: 1-so'zda " + matched + " ta matn-parametr, o'qilgan: [" +
            readback.join(" | ") + "], kutilgan: \"" + expectedText + "\"";
    } catch (e) {
        return "diagnostika xatosi: " + e.toString();
    }
}

// Below this "slot" length (time this word actually has before the next one starts), a word
// is skipped entirely rather than animated — per explicit user request: forcing a kinetic burst
// into a slot this short during rapid-fire speech only produces an unreadable flash, not an
// emphasis effect.
var FAST_SKIP_SLOT_SECONDS = 0.22;

// --- After Effects kinetic typography ---------------------------------------------------------
// AE has no MOGRT-import equivalent to Sequence.importMGT() (see insertKineticText() below) and
// no real need for one: AE's own Text Animator API is fully scriptable and gives genuine
// per-character control, unlike Premiere's black-box MOGRT clips. parseKineticStyleRecipe() reads
// the *style name* the panel already shows (it lists whatever .mogrt files exist — see
// listKineticStyles(); those filenames were themselves named after this exact category of
// direction/bounce/fade effect) and turns it into a from-scratch AE animation recipe, so the same
// style grid works on both hosts even though only Premiere actually plays back a .mogrt file.

function parseKineticStyleRecipe(style) {
    var name = String(style || "");
    var bounce = /^Bounce_/i.test(name);
    var rest = name.replace(/^(Bounce|Plain)_/i, "");
    if (/^word_up/i.test(rest)) return { unit: "word", kind: "slide", axis: "y", direction: 1, bounce: bounce };
    if (/^word_down/i.test(rest)) return { unit: "word", kind: "slide", axis: "y", direction: -1, bounce: bounce };
    if (/^word_left/i.test(rest)) return { unit: "word", kind: "slide", axis: "x", direction: 1, bounce: bounce };
    if (/^word_right/i.test(rest)) return { unit: "word", kind: "slide", axis: "x", direction: -1, bounce: bounce };
    if (/^character_up/i.test(rest)) return { unit: "character", kind: "slide", axis: "y", direction: 1, bounce: bounce };
    if (/^character_down/i.test(rest)) return { unit: "character", kind: "slide", axis: "y", direction: -1, bounce: bounce };
    if (/^character_left/i.test(rest)) return { unit: "character", kind: "slide", axis: "x", direction: 1, bounce: bounce };
    if (/^character_right/i.test(rest)) return { unit: "character", kind: "slide", axis: "x", direction: -1, bounce: bounce };
    if (/^position_bounce/i.test(rest)) return { unit: "word", kind: "slide", axis: "y", direction: 1, bounce: true };
    if (/^scale_bounce/i.test(rest)) return { unit: "word", kind: "scale", bounce: true };
    if (/^fade/i.test(rest)) return { unit: "word", kind: "fade" };
    if (/^1by1/i.test(rest)) return { unit: "character", kind: "reveal" };
    if (/^flicker/i.test(rest)) return { unit: "word", kind: "flicker" };
    return { unit: "word", kind: "fade" }; // unrecognized style name -> safe, always-visible fallback
}

var AE_KINETIC_ENTRANCE_SECONDS = 0.22;
var AE_KINETIC_FADE_SECONDS = 0.14;
var AE_KINETIC_SLIDE_OFFSET_RATIO = 0.10; // fraction of min(comp.width, comp.height)

/** Runs fn(), swallowing any error — so one unsupported keyframe/property call on a given AE
 * version can't abort the rest of a word's animation setup (the word still ends up on screen,
 * just missing that one flourish, rather than not being placed at all). */
function _ae_try(fn) {
    try { fn(); } catch (e) {}
}

function _ae_easeKey(prop, keyIndex, overshoot) {
    _ae_try(function () {
        var ease = new KeyframeEase(0, overshoot ? 30 : 60);
        prop.setInterpolationTypeAtKey(keyIndex, KeyframeInterpolationType.BEZIER, KeyframeInterpolationType.BEZIER);
        prop.setTemporalEaseAtKey(keyIndex, [ease], [ease]);
    });
}

/**
 * Whole-word entrance: slides and/or scales in with an opacity fade, optionally overshooting
 * past its resting value before settling back (the "bounce" styles) — all on the layer's own
 * Transform properties, since the whole word moves as one unit (no Text Animator needed here;
 * that's only for the per-character styles below).
 */
function _ae_animateWordEntrance(textLayer, comp, recipe, startSeconds, entranceSeconds) {
    var opacityProp = textLayer.property("Transform").property("Opacity");
    var restPosition = textLayer.property("Transform").property("Position").value;
    var restScale = textLayer.property("Transform").property("Scale").value;
    // entranceSeconds (caller-computed, clamped to this word's actual on-screen duration) is
    // used when given, falling back to the nominal constant only for standalone/direct calls —
    // without this, a word placed right before the composition's own end could get keyframes
    // for an entrance animation longer than the time it's actually visible for.
    var entrance = entranceSeconds || AE_KINETIC_ENTRANCE_SECONDS;
    var fadeSeconds = Math.min(AE_KINETIC_FADE_SECONDS, entrance);

    _ae_try(function () {
        opacityProp.setValueAtTime(startSeconds, 0);
        opacityProp.setValueAtTime(startSeconds + fadeSeconds, 100);
    });

    if (recipe.kind === "slide") {
        var offset = Math.round(Math.min(comp.width, comp.height) * AE_KINETIC_SLIDE_OFFSET_RATIO);
        var vector = recipe.axis === "x" ? [offset * recipe.direction, 0, 0] : [0, offset * recipe.direction, 0];
        var startPos = [restPosition[0] + vector[0], restPosition[1] + vector[1], restPosition[2] || 0];
        var posProp = textLayer.property("Transform").property("Position");
        _ae_try(function () {
            posProp.setValueAtTime(startSeconds, startPos);
            if (recipe.bounce) {
                // Overshoots slightly past the resting position (opposite the travel direction)
                // before settling back — the "spring" look the Bounce_* styles are named for.
                var overshoot = [restPosition[0] - vector[0] * 0.18, restPosition[1] - vector[1] * 0.18, restPosition[2] || 0];
                posProp.setValueAtTime(startSeconds + entrance * 0.7, overshoot);
            }
            posProp.setValueAtTime(startSeconds + entrance, restPosition);
        });
        _ae_try(function () {
            for (var k = 1; k <= posProp.numKeys; k++) {
                _ae_easeKey(posProp, k, recipe.bounce);
            }
        });
    } else if (recipe.kind === "scale") {
        var scaleProp = textLayer.property("Transform").property("Scale");
        _ae_try(function () {
            scaleProp.setValueAtTime(startSeconds, [restScale[0] * 0.4, restScale[1] * 0.4, restScale[2] || 100]);
            if (recipe.bounce) {
                scaleProp.setValueAtTime(startSeconds + entrance * 0.7, [restScale[0] * 1.15, restScale[1] * 1.15, restScale[2] || 100]);
            }
            scaleProp.setValueAtTime(startSeconds + entrance, restScale);
        });
        _ae_try(function () {
            for (var k = 1; k <= scaleProp.numKeys; k++) {
                _ae_easeKey(scaleProp, k, recipe.bounce);
            }
        });
    } else if (recipe.kind === "flicker") {
        // Fast opacity flashes before settling fully visible — a cheap stand-in for a
        // glitch-style "flicker in" without needing an actual glitch/displacement effect.
        _ae_try(function () {
            opacityProp.setValueAtTime(startSeconds, 0);
            opacityProp.setValueAtTime(startSeconds + 0.03, 100);
            opacityProp.setValueAtTime(startSeconds + 0.06, 0);
            opacityProp.setValueAtTime(startSeconds + 0.09, 100);
            for (var k = 1; k <= opacityProp.numKeys; k++) {
                opacityProp.setInterpolationTypeAtKey(k, KeyframeInterpolationType.LINEAR, KeyframeInterpolationType.LINEAR);
            }
        });
    }
    // "fade" needs nothing beyond the opacity keyframes already set above.
}

// 1=Square 2=RampUp 3=RampDown 4=Triangle 5=Round 6=Smooth (Adobe scripting guide's Range
// Selector "Shape" enum). RampUp is expected to reveal the string front-to-back as Offset below
// sweeps from -100% to 100%, but this — like several other "first real Premiere test" notes
// elsewhere in this file — has NOT yet been confirmed against a live AE render. If characters
// reveal back-to-front instead, flip this to 3 (RampDown).
var AE_CHAR_RAMP_SHAPE = 2;

/**
 * Per-character entrance via AE's Text Animator + Range Selector: an Animator's Position/Opacity
 * properties apply only to whichever characters the Range Selector currently "covers", and
 * keyframing the selector's Offset while its range Shape is a ramp sweeps that coverage across
 * the string over time — the scripted equivalent of AE's built-in "Animate In: Fade Up
 * Characters"/typewriter presets. Falls back to false (caller then uses the whole-word entrance
 * instead) if any of this throws, e.g. on an AE version where a match name has changed.
 */
function _ae_addCharacterStagger(textLayer, comp, recipe, startSeconds, entranceSeconds) {
    try {
        var animators = textLayer.property("ADBE Text Properties").property("ADBE Text Animators");
        var animator = animators.addProperty("ADBE Text Animator");
        var animatorProps = animator.property("ADBE Text Animator Properties");

        var opacityProp = animatorProps.addProperty("ADBE Text Opacity");
        opacityProp.setValue(0);

        if (recipe.kind === "slide") {
            var offset = Math.round(Math.min(comp.width, comp.height) * AE_KINETIC_SLIDE_OFFSET_RATIO);
            var posProp = animatorProps.addProperty("ADBE Text Position 3D");
            posProp.setValue(recipe.axis === "x" ? [offset * recipe.direction, 0, 0] : [0, offset * recipe.direction, 0]);
        }

        var selectors = animator.property("ADBE Text Selectors");
        var rangeSelector = selectors.addProperty("ADBE Text Selector");
        _ae_try(function () {
            rangeSelector.property("ADBE Text Range Advanced").property("ADBE Text Range Shape").setValue(AE_CHAR_RAMP_SHAPE);
        });

        var offsetProp = rangeSelector.property("ADBE Text Percent Offset");
        offsetProp.setValueAtTime(startSeconds, -100);
        offsetProp.setValueAtTime(startSeconds + entranceSeconds, 100);
        _ae_try(function () {
            for (var k = 1; k <= offsetProp.numKeys; k++) {
                offsetProp.setInterpolationTypeAtKey(k, KeyframeInterpolationType.LINEAR, KeyframeInterpolationType.LINEAR);
            }
        });
        return true;
    } catch (e) {
        return false;
    }
}

// Regenerating (new style/duration try) replaces the previous kinetic layers instead of stacking
// a second set on top — same reasoning as lastKineticClips for Premiere, just using AE's layer
// .remove() via the shared clearTrackedLayers() helper (already used for AE captions above).
var lastAeKineticLayers = [];

/**
 * Adds one text layer per word directly into the active composition, each timed to that word's
 * start and held until the next word begins (same "avoid mid-sentence flicker" reasoning as
 * insertCaptionMogrt()/insertKineticText()'s Premiere path), animated in per parseKineticStyleRecipe().
 * Unlike Premiere, AE text layers don't need track-scheduling for overlaps — layers simply stack
 * by z-order (later-added layers render on top), so consecutive/overlapping words never collide.
 */
// AE-only appearance defaults (Premiere's MOGRT path has no equivalent — see the panel's
// "faqat After Effects'da qo'llanadi" note next to these controls in index.html). sizeRatio is
// a multiplier on this base fraction of the comp's shorter dimension, driven by the panel's
// #kinetic-size-slider (50-200%).
var AE_KINETIC_BASE_SIZE_RATIO = 0.09;

function _ae_insertKineticText(style, wordsJson, minDurationSeconds, styleOptionsJson) {
    var comp = _ae_findActiveComp();
    if (!comp) {
        return "ERROR: Faol kompozitsiya topilmadi. Avval bir kompozitsiyani oching.";
    }

    var words;
    try {
        words = JSON.parse(wordsJson);
    } catch (eParse) {
        return "ERROR: So'zlar ma'lumotini o'qib bo'lmadi.";
    }
    if (!words || !words.length) {
        return "ERROR: Animatsiya uchun so'zlar topilmadi.";
    }

    var styleOptions = {};
    try {
        styleOptions = JSON.parse(styleOptionsJson) || {};
    } catch (eOpt) {
        styleOptions = {};
    }
    var sizeRatio = AE_KINETIC_BASE_SIZE_RATIO * (Number(styleOptions.sizeRatio) || 1);
    var positionY;
    if (styleOptions.position === "top") {
        positionY = comp.height * 0.15;
    } else if (styleOptions.position === "bottom") {
        positionY = comp.height * 0.85;
    } else {
        positionY = comp.height / 2;
    }

    var recipe = parseKineticStyleRecipe(style);
    clearTrackedLayers(lastAeKineticLayers);

    app.beginUndoGroup("Ravon Captions - kinetic typography");
    try {
        var added = 0;
        var skippedFast = 0;
        for (var i = 0; i < words.length; i++) {
            var word = words[i];
            if (!word || !word.text) {
                continue;
            }

            var nextWord = words[i + 1];
            var slotSeconds = (nextWord ? nextWord.start : word.end) - word.start;
            if (slotSeconds < FAST_SKIP_SLOT_SECONDS) {
                skippedFast++;
                dispatchProgress("kinetic", i + 1, words.length);
                continue;
            }

            var startSeconds = Math.max(0, Math.min(word.start, comp.duration));
            var holdUntil = (nextWord && nextWord.start > word.end) ? nextWord.start : word.end;
            var duration = Math.max(holdUntil - word.start, minDurationSeconds || 0, AE_KINETIC_ENTRANCE_SECONDS + 0.1);
            var endSeconds = Math.max(startSeconds + 0.1, Math.min(startSeconds + duration, comp.duration));

            var textLayer = comp.layers.addText(word.text);
            lastAeKineticLayers.push(textLayer);
            _ae_try(function () {
                textLayer.startTime = 0;
                textLayer.inPoint = startSeconds;
                textLayer.outPoint = endSeconds;
            });
            _ae_styleTextLayer(textLayer, comp, sizeRatio, styleOptions);
            _ae_try(function () {
                textLayer.property("Transform").property("Position").setValue([comp.width / 2, positionY]);
            });

            var entranceSeconds = Math.min(AE_KINETIC_ENTRANCE_SECONDS, Math.max(endSeconds - startSeconds - 0.02, 0.05));
            if (recipe.unit === "character") {
                var staggered = _ae_addCharacterStagger(textLayer, comp, recipe, startSeconds, entranceSeconds);
                if (!staggered) {
                    _ae_animateWordEntrance(textLayer, comp, { unit: "word", kind: "fade" }, startSeconds, entranceSeconds);
                }
            } else {
                _ae_animateWordEntrance(textLayer, comp, recipe, startSeconds, entranceSeconds);
            }

            dispatchProgress("kinetic", i + 1, words.length);
            added++;
        }

        if (added === 0) {
            if (skippedFast > 0) {
                return "Butun matn juda tez gapirilgani uchun (" + skippedFast +
                    " ta so'z) animatsiyasiz qoldirildi. Oddiy subtitr hamon amal qiladi.";
            }
            return "ERROR: Hech qanday so'z uchun animatsiya qo'shib bo'lmadi.";
        }
        var summary = added + "/" + words.length + " so'z animatsiya bilan '" + comp.name + "' kompozitsiyasiga qo'shildi.";
        if (skippedFast > 0) {
            summary += " (" + skippedFast + " ta so'z tez gapirilgani uchun animatsiyasiz qoldirildi)";
        }
        return summary;
    } finally {
        app.endUndoGroup();
    }
}

/** Sets a text layer's Source Text to `text`, left-justified (needed by the width-measurement
 * trick in splitSelectedTextToWords() below — center/right justification would shift where the
 * measured substring's left edge sits relative to the layer's anchor). */
function _ae_setLayerTextLeft(targetLayer, text) {
    var p = targetLayer.property("Source Text");
    var td = p.value;
    td.text = text;
    try { td.justification = ParagraphJustification.LEFT_JUSTIFY; } catch (eJust) {}
    p.setValue(td);
}

/**
 * Splits the selected text layer into one text layer per word, positioned at the same
 * horizontal spots the words occupied in the original combined text — a manual editing utility
 * for hand-animating a title/phrase word-by-word (works on any text layer the user selects in
 * the Timeline, independent of transcription/timestamps, unlike _ae_insertKineticText() above).
 * Technique: a throwaway hidden duplicate layer has its text swapped word-by-word (each with a
 * trailing "|" marker) so its rendered width can be measured via sourceRectAtTime() — the marker
 * is needed because AE trims trailing whitespace out of that measurement, which would otherwise
 * throw off every word's computed left edge; subtracting the marker-only width cancels it back
 * out. Layer.sourcePointToComp() then converts each word's source-space center into the comp
 * coordinate its own duplicate layer needs to be moved to.
 */
function splitSelectedTextToWords() {
    var comp = _ae_findActiveComp();
    if (!comp) {
        return "ERROR: Faol kompozitsiya topilmadi. Avval bir kompozitsiyani oching.";
    }
    if (comp.selectedLayers.length !== 1) {
        return "ERROR: Aynan bitta matn qatlamini tanlang (Timeline'da bosib belgilang).";
    }
    var layer = comp.selectedLayers[0];
    var sourceTextProp;
    try {
        sourceTextProp = layer.property("Source Text");
    } catch (eProp) {
        sourceTextProp = null;
    }
    if (!sourceTextProp) {
        return "ERROR: Tanlangan qatlam matn qatlami emas.";
    }

    var fullText = sourceTextProp.value.text;
    if (!fullText || !fullText.replace(/\s+/g, "")) {
        return "ERROR: Matn qatlami bo'sh.";
    }
    var matches = [];
    var re = /\S+/g;
    var m;
    while ((m = re.exec(fullText)) !== null) {
        matches.push({ word: m[0], index: m.index });
    }
    if (matches.length < 2) {
        return "ERROR: Matnda kamida 2 ta so'z bo'lishi kerak (bitta so'zni ajratishning ma'nosi yo'q).";
    }

    app.beginUndoGroup("Ravon Captions - so'zlarga ajratish");
    try {
        var time = comp.time;
        var originalRect = layer.sourceRectAtTime(time, false);
        var originalTransform = layer.property("Transform");
        var originalAnchorY = originalTransform.property("Anchor Point").value[1];
        var originalPositionY = originalTransform.property("Position").value[1];

        var measureLayer = layer.duplicate();
        measureLayer.enabled = false;

        function measureWidth(text) {
            _ae_setLayerTextLeft(measureLayer, text + "|");
            var withMarker = measureLayer.sourceRectAtTime(time, false).width;
            _ae_setLayerTextLeft(measureLayer, "|");
            var markerOnly = measureLayer.sourceRectAtTime(time, false).width;
            return withMarker - markerOnly;
        }

        var created = 0;
        for (var i = 0; i < matches.length; i++) {
            var word = matches[i].word;
            var prefixWidth = measureWidth(fullText.substring(0, matches[i].index));
            var wordLeftInSource = originalRect.left + prefixWidth;

            var newLayer = layer.duplicate();
            newLayer.name = word;
            _ae_setLayerTextLeft(newLayer, word);

            var newRect = newLayer.sourceRectAtTime(time, false);
            var wordCenterInSourceX = wordLeftInSource + newRect.width / 2;
            var compPointX = layer.sourcePointToComp([wordCenterInSourceX, originalRect.top])[0];

            var tr = newLayer.property("Transform");
            var oldAnchor = tr.property("Anchor Point").value;
            var oldPos = tr.property("Position").value;
            var anchorX = newRect.left + newRect.width / 2;
            if (oldAnchor.length === 2) {
                tr.property("Anchor Point").setValue([anchorX, originalAnchorY]);
            } else {
                tr.property("Anchor Point").setValue([anchorX, originalAnchorY, oldAnchor[2]]);
            }
            if (oldPos.length === 2) {
                tr.property("Position").setValue([compPointX, originalPositionY]);
            } else {
                tr.property("Position").setValue([compPointX, originalPositionY, oldPos[2]]);
            }
            created++;
        }

        measureLayer.remove();
        layer.enabled = false;

        return created + " ta so'zga ajratildi (asl qatlam o'chirilgan holda, tagida saqlandi).";
    } catch (e) {
        return "ERROR: " + e.toString();
    } finally {
        app.endUndoGroup();
    }
}

/** Escapes text for embedding as a double-quoted string literal inside a generated AE expression
 * (not the same escaping evalScript's own call string needs — this one only has to satisfy
 * ExtendScript's own string-literal syntax once the expression is actually assigned/evaluated). */
function _ae_escapeForExpressionString(text) {
    return String(text)
        .replace(/\\/g, "\\\\")
        .replace(/"/g, '\\"')
        .replace(/\r?\n/g, "\\n");
}

/**
 * Applies a typewriter reveal + blinking cursor to the selected text layer via a single Source
 * Text expression driven by a keyframed Slider Control effect. Done via an expression (not a
 * Text Animator Range Selector, unlike the rest of this file's kinetic effects) because the
 * cursor character has to track the reveal edge exactly, and an expression reading a plain 0-100
 * slider value is a far more direct way to compute "how many characters are revealed right now"
 * than reading a Range Selector's own internal timing back out.
 */
function addTypingCursorEffect(durationSeconds) {
    var comp = _ae_findActiveComp();
    if (!comp) {
        return "ERROR: Faol kompozitsiya topilmadi. Avval bir kompozitsiyani oching.";
    }
    if (comp.selectedLayers.length !== 1) {
        return "ERROR: Aynan bitta matn qatlamini tanlang (Timeline'da bosib belgilang).";
    }
    var layer = comp.selectedLayers[0];
    var sourceTextProp;
    try {
        sourceTextProp = layer.property("Source Text");
    } catch (eProp) {
        sourceTextProp = null;
    }
    if (!sourceTextProp) {
        return "ERROR: Tanlangan qatlam matn qatlami emas.";
    }
    var fullText = sourceTextProp.value.text;
    if (!fullText) {
        return "ERROR: Matn qatlami bo'sh.";
    }

    app.beginUndoGroup("Ravon Captions - yozuv kursor effekti");
    try {
        var time = comp.time;
        var effects = layer.property("Effects");
        var reveal = effects.addProperty("ADBE Slider Control");
        reveal.name = "Reveal";
        var duration = Math.max(Number(durationSeconds) || 1.5, 0.2);
        reveal.property(1).setValueAtTime(time, 0);
        reveal.property(1).setValueAtTime(time + duration, 100);

        var escaped = _ae_escapeForExpressionString(fullText);
        sourceTextProp.expression =
            'var full = "' + escaped + '";\n' +
            'var reveal = effect("Reveal")(1);\n' +
            'var n = Math.round(full.length * (reveal / 100));\n' +
            'var shown = full.substr(0, n);\n' +
            'var blink = Math.sin(time * 10) >= 0;\n' +
            'shown + (blink ? "|" : "");';

        return "Yozuv kursor effekti qo'shildi (" + duration.toFixed(1) + "s davomida yoziladi).";
    } catch (e) {
        return "ERROR: " + e.toString();
    } finally {
        app.endUndoGroup();
    }
}
// --- End After Effects kinetic typography ------------------------------------------------------

/**
 * Places one MOGRT clip instance per word on its own overlay track, each trimmed to that
 * word's start/end and re-texted to that word. Unlike SRT/video files, .mogrt files can't be
 * brought in through app.project.importFiles() — recent Premiere versions reject that outright
 * ("Motion Graphics Templates cannot be imported into the Project panel") and install them into
 * the Graphics Templates panel instead, never producing a project item to place with
 * overwriteClip. Sequence.importMGT() is the dedicated, documented API for this: it drops a
 * MOGRT straight onto a track at a given time and hands back the resulting TrackItem directly,
 * with no project-item detour needed. (After Effects instead uses _ae_insertKineticText() above,
 * a from-scratch Text Animator implementation — AE has no MOGRT-placement API to route through.)
 */
function insertKineticText(style, wordsJson, sourceMediaPath, mogrtFolder, minDurationSeconds, styleOptionsJson) {
    try {
        if (BridgeTalk.appName === "aftereffects") {
            return _ae_insertKineticText(style, wordsJson, minDurationSeconds, styleOptionsJson);
        }
        if (BridgeTalk.appName !== "premierepro") {
            return "ERROR: Animatsion matn faqat Premiere Pro yoki After Effects'da qo'llab-quvvatlanadi.";
        }
        if (!app.project) {
            return "ERROR: Premiere'da ochiq loyiha topilmadi.";
        }
        var sequence = app.project.activeSequence;
        if (!sequence) {
            return "ERROR: Ochiq sequence (timeline) topilmadi. Avval bir sequence oching.";
        }

        var mogrtPath = getMogrtPath(style, mogrtFolder);
        if (!mogrtPath) {
            return "ERROR: Noma'lum animatsiya uslubi: " + style;
        }
        var mogrtFile = new File(mogrtPath);
        if (!mogrtFile.exists) {
            return "ERROR: Animatsiya shabloni topilmadi (" + mogrtPath + "). Avval MOGRT shablonlarini tayyorlang — host/assets/mogrt/README.md ga qarang.";
        }

        var words;
        try {
            words = JSON.parse(wordsJson);
        } catch (eParse) {
            return "ERROR: So'zlar ma'lumotini o'qib bo'lmadi.";
        }
        if (!words || !words.length) {
            return "ERROR: Animatsiya uchun so'zlar topilmadi.";
        }

        var offsetSeconds = 0;
        if (sourceMediaPath) {
            var found = findSourceTimeZeroOffset(sequence, sourceMediaPath);
            if (found !== null) {
                offsetSeconds = Math.max(0, found);
            }
        }

        // Trying a different style or a different minDurationSeconds is meant to be an
        // iterate-and-preview loop (pick a style, look at the timeline, try another) — so a
        // fresh call here clears out whatever this function placed last time first, rather than
        // stacking a second animation on top of the first.
        clearTrackedClips(lastKineticClips);

        // A single overlay track isn't enough: minDurationSeconds is a readability floor that
        // can legitimately outlast the real gap to the next word during fast speech, so
        // consecutive word clips can genuinely need to overlap in time. On one track that
        // overlap corrupted the earlier clip instead of the words visually overlapping — reading
        // as "the word never finishes, it jumps to the next one early". Tracks are now handed
        // out with a greedy interval scheduler (the standard minimum-tracks-for-overlapping-
        // intervals approach): a word only reuses a track that's already free by the time it
        // starts; otherwise a new track is added. Slow speech (real gaps bigger than the floor)
        // never triggers a second track at all. Previously-used tracks (now empty, since the
        // clips on them were just cleared above) are reused first instead of always adding new
        // ones, so switching styles repeatedly doesn't leave a growing pile of empty tracks.
        var trackPool = [];
        for (var pt = 0; pt < lastKineticTrackIndices.length; pt++) {
            trackPool.push({ trackIndex: lastKineticTrackIndices[pt], freeAt: 0 });
        }
        function pickTrack(startSeconds) {
            for (var t = 0; t < trackPool.length; t++) {
                if (trackPool[t].freeAt <= startSeconds + 0.001) {
                    return trackPool[t];
                }
            }
            var overlay = addOverlayTrack(sequence);
            var entry = { trackIndex: overlay.trackIndex, freeAt: 0 };
            trackPool.push(entry);
            return entry;
        }

        // Calling importMGT() repeatedly with the exact same source path made every placed
        // instance share one underlying template link — editing one word's text/position
        // showed up on all of them instead of staying independent. Giving each word its own
        // physical copy of the .mogrt file forces Premiere to treat every instance as a
        // separate template, since there's no shared source path left to link them through.
        var instanceFolder = new Folder(Folder.temp.fsName + "/uzbek-ai-captions-kinetic-" + Date.now());
        instanceFolder.create();

        var added = 0;
        var textFailed = 0;
        var importFailed = 0;
        var skippedFast = 0;
        var diagnostic = "";
        for (var i = 0; i < words.length; i++) {
            var word = words[i];
            if (!word || !word.text) {
                continue;
            }

            // Per explicit user request: in very rapid-fire speech, don't force a kinetic burst
            // into a slot too short to be readable at all — skip animating that word entirely
            // (the plain subtitle track, if present, still covers it) rather than flashing an
            // unreadable sliver of text. "Slot" is how much time this word actually has before
            // the next one starts, independent of minDurationSeconds (that floor is for holding
            // a word a bit longer for readability — this is about not animating it at all).
            var nextWord = words[i + 1];
            var slotSeconds = (nextWord ? nextWord.start : word.end) - word.start;
            if (slotSeconds < FAST_SKIP_SLOT_SECONDS) {
                skippedFast++;
                dispatchProgress("kinetic", i + 1, words.length);
                continue;
            }

            var startSeconds = offsetSeconds + word.start;
            var track = pickTrack(startSeconds);

            var instanceFile = new File(instanceFolder.fsName + "/word_" + i + ".mogrt");
            if (!mogrtFile.copy(instanceFile.fsName)) {
                importFailed++;
                continue;
            }

            var insertedClip = null;
            try {
                insertedClip = sequence.importMGT(instanceFile.fsName, secondsToTicksString(startSeconds), track.trackIndex, 0);
            } catch (eImport) {
                insertedClip = null;
            }
            if (!insertedClip) {
                importFailed++;
                continue;
            }
            lastKineticClips.push(insertedClip);

            // Text is set before trimming (rather than after) in case trimming the clip's
            // duration resets or re-reads the MGT component's cached properties.
            var textOk = setMogrtText(insertedClip, word.text);
            if (i === 0) {
                diagnostic = setMogrtTextDiagnostic(insertedClip, word.text);
            }

            // Trimming to the word's own end (word.end - word.start) left a silent gap before
            // the next word's clip — natural speech always has a small pause between words —
            // which read as constant flicker (each word popping in and abruptly vanishing
            // before the next one appeared). Holding it until the next word starts instead
            // keeps the text on screen continuously; minDurationSeconds is then just a floor
            // on top of that. Neither can push the clip past the MOGRT's own native length —
            // there's no code path here that extends a clip beyond what importMGT placed — so
            // a long pause (e.g. end of a sentence) still just plays the short native
            // animation and disappears, rather than freezing on screen for the whole gap.
            var holdUntil = (nextWord && nextWord.start > word.end) ? nextWord.start : word.end;
            var duration = Math.max(holdUntil - word.start, minDurationSeconds || 0);
            if (duration > 0 && (insertedClip.end.seconds - insertedClip.start.seconds) > duration) {
                try {
                    var newEnd = new Time();
                    newEnd.seconds = startSeconds + duration;
                    insertedClip.end = newEnd;
                } catch (eTrim) {
                    // best-effort trim; leave the clip at its native length if this fails
                }
            }
            track.freeAt = insertedClip.end.seconds;
            dispatchProgress("kinetic", i + 1, words.length);

            if (textOk) {
                added++;
            } else {
                textFailed++;
            }
        }

        lastKineticTrackIndices = [];
        for (var st = 0; st < trackPool.length; st++) {
            lastKineticTrackIndices.push(trackPool[st].trackIndex);
        }

        if (added === 0) {
            if (skippedFast > 0 && importFailed === 0) {
                return "Butun matn juda tez gapirilgani uchun (" + skippedFast +
                    " ta so'z) animatsiyasiz qoldirildi. Oddiy subtitr hamon amal qiladi.";
            }
            return "ERROR: Hech qanday so'z uchun animatsiya qo'shib bo'lmadi" +
                (importFailed > 0 ? " (" + importFailed + " tasida MOGRT joylashtirilmadi)" : "") + ".";
        }
        var summary = added + "/" + words.length + " so'z animatsiya bilan qo'shildi.";
        var notes = [];
        if (textFailed > 0) {
            notes.push(textFailed + " tasida matnni o'rnatib bo'lmadi");
        }
        if (importFailed > 0) {
            notes.push(importFailed + " tasida MOGRT joylashtirilmadi");
        }
        if (skippedFast > 0) {
            notes.push(skippedFast + " ta so'z tez gapirilgani uchun animatsiyasiz qoldirildi");
        }
        if (trackPool.length > 1) {
            notes.push(trackPool.length + " ta qatlamda joylashtirildi");
        }
        if (diagnostic) {
            notes.push(diagnostic);
        }
        if (notes.length) {
            summary += " (" + notes.join(", ") + ")";
        }
        return summary;
    } catch (e) {
        return "ERROR: " + e.toString();
    }
}

// Default subtitle style until a dedicated multi-line "caption box" .mogrt exists — chosen by
// the user directly after comparing the in-panel style previews. Swap this (or expose a style
// picker on the plain "Subtitr yaratish" flow too) if a purpose-built caption style shows up.
var DEFAULT_CAPTION_STYLE = "Plain_word_down";

/**
 * Places one MOGRT clip instance per subtitle cue (not per word) on its own overlay track, each
 * holding the cue's exact line-wrapped text for its exact duration. The alternative — the old
 * importSrtPremiere() path — hands the SRT to Premiere's native Captions import, which applies
 * Premiere's own default caption style and re-wraps the text by its own line-width rules,
 * ignoring the line breaks buildSrt() already computed (a maxLines=1 cue could still render as
 * 2 lines). Worse, Adobe has confirmed there is currently no ExtendScript API to control a
 * caption style's font/color/background at all. Routing through a MOGRT instead renders exactly
 * the text and line breaks we built, and opens a real (if for now style-limited) path to
 * font/color/background control later, the same way insertKineticText() does per word.
 */
function insertCaptionMogrt(style, srtPath, sourceMediaPath, mogrtFolder) {
    try {
        if (BridgeTalk.appName !== "premierepro") {
            return "ERROR: Bu funksiya faqat Premiere Pro'da qo'llab-quvvatlanadi.";
        }
        if (!app.project) {
            return "ERROR: Premiere'da ochiq loyiha topilmadi.";
        }
        var sequence = app.project.activeSequence;
        if (!sequence) {
            return "ERROR: Ochiq sequence (timeline) topilmadi. Avval bir sequence oching.";
        }

        var mogrtPath = getMogrtPath(style || DEFAULT_CAPTION_STYLE, mogrtFolder);
        if (!mogrtPath) {
            return "ERROR: Noma'lum subtitr uslubi: " + style;
        }
        var mogrtFile = new File(mogrtPath);
        if (!mogrtFile.exists) {
            return "ERROR: Subtitr shabloni topilmadi (" + mogrtPath + ").";
        }

        var srtFile = new File(srtPath);
        if (!srtFile.exists) {
            return "ERROR: SRT fayl topilmadi: " + srtPath;
        }
        var cues = parseSrt(srtFile);
        if (!cues.length) {
            return "ERROR: SRT faylda subtitr topilmadi.";
        }

        var offsetSeconds = 0;
        if (sourceMediaPath) {
            var found = findSourceTimeZeroOffset(sequence, sourceMediaPath);
            if (found !== null) {
                offsetSeconds = Math.max(0, found);
            }
        }

        // Regenerating (new style, or "Subtitr yaratish" run again) replaces the previous
        // caption overlay instead of stacking a second one on top of it — same reasoning as
        // insertKineticText().
        clearTrackedClips(lastCaptionClips);

        // Same greedy interval-scheduling as insertKineticText(): cues are normally
        // non-overlapping (SrtBuilderService.fixOverlaps already enforces a gap between them),
        // so this will almost always stay on a single track — kept anyway as a safety net.
        // Previously-used (now empty) tracks are reused first.
        var trackPool = [];
        for (var pt = 0; pt < lastCaptionTrackIndices.length; pt++) {
            trackPool.push({ trackIndex: lastCaptionTrackIndices[pt], freeAt: 0 });
        }
        function pickTrack(startSeconds) {
            for (var t = 0; t < trackPool.length; t++) {
                if (trackPool[t].freeAt <= startSeconds + 0.001) {
                    return trackPool[t];
                }
            }
            var overlay = addOverlayTrack(sequence);
            var entry = { trackIndex: overlay.trackIndex, freeAt: 0 };
            trackPool.push(entry);
            return entry;
        }

        // Same reasoning as insertKineticText(): give every cue its own physical copy of the
        // .mogrt so Premiere treats each placed instance as an independent template rather than
        // linking them all to one shared source.
        var instanceFolder = new Folder(Folder.temp.fsName + "/uzbek-ai-captions-subs-" + Date.now());
        instanceFolder.create();

        var added = 0;
        var textFailed = 0;
        var importFailed = 0;
        for (var i = 0; i < cues.length; i++) {
            var cue = cues[i];
            if (!cue || !cue.text) {
                continue;
            }
            var startSeconds = offsetSeconds + cue.start;
            var track = pickTrack(startSeconds);

            var instanceFile = new File(instanceFolder.fsName + "/cue_" + i + ".mogrt");
            if (!mogrtFile.copy(instanceFile.fsName)) {
                importFailed++;
                continue;
            }

            var insertedClip = null;
            try {
                insertedClip = sequence.importMGT(instanceFile.fsName, secondsToTicksString(startSeconds), track.trackIndex, 0);
            } catch (eImport) {
                insertedClip = null;
            }
            if (!insertedClip) {
                importFailed++;
                continue;
            }
            lastCaptionClips.push(insertedClip);

            var textOk = setMogrtText(insertedClip, cue.text);

            // Unlike insertKineticText() (short word-burst animations that are only ever
            // trimmed shorter, never held past their native length), a caption has to stay on
            // screen for the cue's whole spoken duration — which is very often longer than the
            // MOGRT's native/default length (most caption templates default to ~2s). Only
            // shrinking when native > desired left every cue whose speech ran longer than that
            // default disappearing early mid-sentence, i.e. captions "falling behind" and long
            // stretches of speech going uncaptioned. So this always sets the end to the cue's
            // real duration, extending past the native length when needed (caption/lower-third
            // MOGRTs are built to be held indefinitely on their settled frame, unlike the
            // one-shot kinetic burst templates).
            var duration = Math.max(cue.end - cue.start, 0.1);
            if (duration > 0) {
                try {
                    var newEnd = new Time();
                    newEnd.seconds = startSeconds + duration;
                    insertedClip.end = newEnd;
                } catch (eTrim) {
                    // best-effort trim; leave the clip at its native length if this fails
                }
            }
            track.freeAt = insertedClip.end.seconds;
            dispatchProgress("caption", i + 1, cues.length);

            if (textOk) {
                added++;
            } else {
                textFailed++;
            }
        }

        lastCaptionTrackIndices = [];
        for (var st = 0; st < trackPool.length; st++) {
            lastCaptionTrackIndices.push(trackPool[st].trackIndex);
        }

        if (added === 0) {
            return "ERROR: Hech qanday subtitr uchun animatsiya qo'shib bo'lmadi" +
                (importFailed > 0 ? " (" + importFailed + " tasida MOGRT joylashtirilmadi)" : "") + ".";
        }
        var summary = added + "/" + cues.length + " subtitr qo'shildi.";
        var notes = [];
        if (textFailed > 0) {
            notes.push(textFailed + " tasida matnni o'rnatib bo'lmadi");
        }
        if (importFailed > 0) {
            notes.push(importFailed + " tasida MOGRT joylashtirilmadi");
        }
        if (trackPool.length > 1) {
            notes.push(trackPool.length + " ta qatlamda joylashtirildi");
        }
        if (notes.length) {
            summary += " (" + notes.join(", ") + ")";
        }
        return summary;
    } catch (e) {
        return "ERROR: " + e.toString();
    }
}

function parseSrt(file) {
    file.encoding = "UTF-8";
    file.open("r");
    var content = file.read();
    file.close();

    var cues = [];
    var blocks = content.replace(/\r\n/g, "\n").split(/\n\n+/);
    for (var i = 0; i < blocks.length; i++) {
        var block = blocks[i];
        if (!block) {
            continue;
        }
        var lines = block.split("\n");
        if (lines.length < 2) {
            continue;
        }

        var timeLineIndex = lines[0].indexOf("-->") !== -1 ? 0 : 1;
        var timeLine = lines[timeLineIndex];
        var match = timeLine.match(/(\d\d):(\d\d):(\d\d)[,.](\d\d\d)\s*-->\s*(\d\d):(\d\d):(\d\d)[,.](\d\d\d)/);
        if (!match) {
            continue;
        }

        var start = toSeconds(match[1], match[2], match[3], match[4]);
        var end = toSeconds(match[5], match[6], match[7], match[8]);
        var text = lines.slice(timeLineIndex + 1).join("\n");
        if (text) {
            cues.push({ start: start, end: end, text: text });
        }
    }
    return cues;
}

function toSeconds(h, m, s, ms) {
    return parseInt(h, 10) * 3600 + parseInt(m, 10) * 60 + parseInt(s, 10) + parseInt(ms, 10) / 1000;
}
