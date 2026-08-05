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

function getActiveMediaPath() {
    try {
        if (BridgeTalk.appName !== "premierepro") {
            return "ERROR: Faqat Premiere Pro'da qo'llab-quvvatlanadi.";
        }
        if (!app.project) {
            return "ERROR: Premiere'da ochiq loyiha topilmadi.";
        }
        var sequence = app.project.activeSequence;
        if (!sequence) {
            return "ERROR: Ochiq sequence (timeline) topilmadi. Avval bir sequence oching.";
        }
        for (var t = 0; t < sequence.videoTracks.numTracks; t++) {
            var track = sequence.videoTracks[t];
            for (var c = 0; c < track.clips.numItems; c++) {
                var clip = track.clips[c];
                if (clip.projectItem) {
                    var path = clip.projectItem.getMediaPath();
                    // .aegraphic files are MOGRT/Motion Graphics Template internals (cached
                    // under "Motion Graphics Template Media" when a kinetic-text clip is
                    // placed via sequence.importMGT()), never the user's actual source video —
                    // skip them so kinetic-text clips on other tracks can't get mistaken for it.
                    if (path && !/\.aegraphic$/i.test(path)) {
                        return path;
                    }
                }
            }
        }
        return "ERROR: Timeline'da video topilmadi. Avval sequence'ga video qo'shing.";
    } catch (e) {
        return "ERROR: " + e.toString();
    }
}

function importSrt(srtPath, sourceMediaPath) {
    try {
        if (BridgeTalk.appName === "premierepro") {
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

function importSrtPremiere(srtPath, sourceMediaPath) {
    if (!app.project) {
        return "ERROR: Premiere'da ochiq loyiha topilmadi.";
    }
    var sequence = app.project.activeSequence;
    if (!sequence) {
        return "ERROR: Ochiq sequence (timeline) topilmadi. Avval bir sequence oching.";
    }

    var offsetSeconds = 0;
    if (sourceMediaPath) {
        var found = findSourceTimeZeroOffset(sequence, sourceMediaPath);
        if (found !== null) {
            offsetSeconds = Math.max(0, found);
        }
    }

    var importedItem = importSingleFile(srtPath);
    if (!importedItem) {
        return "ERROR: Import qilingan subtitr fayli topilmadi.";
    }

    try {
        var overlay = addOverlayTrack(sequence);
        // overwriteClip (not insertClip) — insertClip does a ripple insert that shifts every
        // clip after it later in time, on every synced track, which was pushing the user's
        // actual video out of place each time a subtitle got added.
        sequence.videoTracks[overlay.trackIndex].overwriteClip(importedItem, secondsToTicksString(offsetSeconds));
        if (overlay.addedNewTrack) {
            return "Subtitr yangi track'ga, videoga moslab qo'shildi (" + offsetSeconds.toFixed(1) + "s).";
        }
        return "Subtitr videoga moslab qo'shildi (" + offsetSeconds.toFixed(1) + "s). Yangi track avtomatik yaratilmadi, mavjud oxirgi track ishlatildi.";
    } catch (e) {
        return "ERROR: Loyihaga import qilindi, lekin Timeline'ga avtomatik qo'yib bo'lmadi (" + e.toString() + "). Uni Project panelidan qo'lda torting.";
    }
}

function importSrtAfterEffects(srtPath) {
    var srtFile = new File(srtPath);
    if (!srtFile.exists) {
        return "ERROR: SRT fayl topilmadi: " + srtPath;
    }

    var cues = parseSrt(srtFile);
    if (cues.length === 0) {
        return "ERROR: SRT faylda subtitr topilmadi.";
    }

    app.beginUndoGroup("Uzbek AI Captions - import");
    try {
        var baseName = srtFile.name.replace(/\.srt$/i, "");
        var compName = baseName + " captions";

        var lastEnd = 0;
        for (var i = 0; i < cues.length; i++) {
            if (cues[i].end > lastEnd) {
                lastEnd = cues[i].end;
            }
        }
        var duration = Math.max(lastEnd + 1, 5);

        var comp = app.project.items.addComp(compName, 1920, 1080, 1.0, duration, 30);

        for (var j = 0; j < cues.length; j++) {
            var cue = cues[j];
            var textLayer = comp.layers.addText(cue.text);
            textLayer.startTime = cue.start;
            textLayer.inPoint = cue.start;
            textLayer.outPoint = cue.end;
        }

        return "Yangi composition yaratildi: '" + compName + "' (" + cues.length + " ta yozuv).";
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
 * Places one MOGRT clip instance per word on its own overlay track, each trimmed to that
 * word's start/end and re-texted to that word. Unlike SRT/video files, .mogrt files can't be
 * brought in through app.project.importFiles() — recent Premiere versions reject that outright
 * ("Motion Graphics Templates cannot be imported into the Project panel") and install them into
 * the Graphics Templates panel instead, never producing a project item to place with
 * overwriteClip. Sequence.importMGT() is the dedicated, documented API for this: it drops a
 * MOGRT straight onto a track at a given time and hands back the resulting TrackItem directly,
 * with no project-item detour needed.
 */
function insertKineticText(style, wordsJson, sourceMediaPath, mogrtFolder, minDurationSeconds) {
    try {
        if (BridgeTalk.appName !== "premierepro") {
            return "ERROR: Animatsion matn faqat Premiere Pro'da qo'llab-quvvatlanadi.";
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

        var overlay = addOverlayTrack(sequence);
        var vidTrackOffset = overlay.trackIndex;

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
        for (var i = 0; i < words.length; i++) {
            var word = words[i];
            if (!word || !word.text) {
                continue;
            }
            var startSeconds = offsetSeconds + word.start;

            var instanceFile = new File(instanceFolder.fsName + "/word_" + i + ".mogrt");
            if (!mogrtFile.copy(instanceFile.fsName)) {
                importFailed++;
                continue;
            }

            var insertedClip = null;
            try {
                insertedClip = sequence.importMGT(instanceFile.fsName, secondsToTicksString(startSeconds), vidTrackOffset, 0);
            } catch (eImport) {
                insertedClip = null;
            }
            if (!insertedClip) {
                importFailed++;
                continue;
            }

            // Text is set before trimming (rather than after) in case trimming the clip's
            // duration resets or re-reads the MGT component's cached properties.
            var textOk = setMogrtText(insertedClip, word.text);

            // Trimming to the word's own end (word.end - word.start) left a silent gap before
            // the next word's clip — natural speech always has a small pause between words —
            // which read as constant flicker (each word popping in and abruptly vanishing
            // before the next one appeared). Holding it until the next word starts instead
            // keeps the text on screen continuously; minDurationSeconds is then just a floor
            // on top of that. Neither can push the clip past the MOGRT's own native length —
            // there's no code path here that extends a clip beyond what importMGT placed — so
            // a long pause (e.g. end of a sentence) still just plays the short native
            // animation and disappears, rather than freezing on screen for the whole gap.
            var nextWord = words[i + 1];
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

            if (textOk) {
                added++;
            } else {
                textFailed++;
            }
        }

        if (added === 0) {
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
