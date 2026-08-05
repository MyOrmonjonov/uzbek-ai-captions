// ExtendScript host code, shared by Premiere Pro (PPRO) and After Effects (AEFT).
// Dispatches on BridgeTalk.appName since the panel is registered for both hosts.

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
                    if (path) {
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

/**
 * Adds a new empty video track above the existing ones if the (undocumented) QE API is
 * available, and returns its index; otherwise falls back to the last existing track.
 * Putting overlays on their own fresh track means we never need to touch whatever the user
 * already has on the video tracks below.
 */
function addOverlayTrack(sequence) {
    var tracksBefore = sequence.videoTracks.numTracks;
    var trackIndex = tracksBefore - 1;
    var addedNewTrack = false;
    try {
        app.enableQE();
        var qeSequence = qe.project.getActiveSequence();
        qeSequence.addTracks(1, 0, 0, 0, 0, 0);
        if (sequence.videoTracks.numTracks > tracksBefore) {
            trackIndex = tracksBefore;
            addedNewTrack = true;
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

    var beforeIds = {};
    var rootChildren = app.project.rootItem.children;
    for (var i = 0; i < rootChildren.numItems; i++) {
        beforeIds[rootChildren[i].nodeId] = true;
    }

    app.project.importFiles([srtPath]);

    var importedItem = null;
    var rootChildrenAfter = app.project.rootItem.children;
    for (var j = 0; j < rootChildrenAfter.numItems; j++) {
        var item = rootChildrenAfter[j];
        if (!beforeIds[item.nodeId]) {
            importedItem = item;
            break;
        }
    }
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

        var beforeIds = {};
        var rootChildren = app.project.rootItem.children;
        for (var i = 0; i < rootChildren.numItems; i++) {
            beforeIds[rootChildren[i].nodeId] = true;
        }

        app.project.importFiles([mediaPath]);

        var importedItem = null;
        var rootChildrenAfter = app.project.rootItem.children;
        for (var j = 0; j < rootChildrenAfter.numItems; j++) {
            var item = rootChildrenAfter[j];
            if (!beforeIds[item.nodeId]) {
                importedItem = item;
                break;
            }
        }
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
