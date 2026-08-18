"""Combines Whisper's frame-accurate word timing with Gemini's more reliable transcription
content. Whisper alone can mishear whole words (not just misspell them) in a low-resource
language like Uzbek, and Gemini's spelling-only correction pass can't fix that since it never
sees the audio. Gemini alone only *estimates* segment timing (an LLM guess) and then
interpolates word positions within each segment by character length.

This runs both models over the same audio, then aligns Gemini's word sequence onto Whisper's
timestamped word sequence via difflib's sequence matching: words Whisper actually recognized
correctly (after spelling correction) get Whisper's real timestamps directly; words Gemini
added, changed, or that Whisper missed/misheard get interpolated between the nearest
surrounding real timestamps, the same way gemini_transcriber does it standalone.
"""

import difflib
import logging
import re
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import gemini_transcriber
import spelling_correction
import transcriber
from transcriber import Segment, TranscriptionResult, Word

_TOKEN_RE = re.compile(r"[^\w']+", re.UNICODE)

# Below this character-similarity ratio, a "replace" pairing is treated as unrelated content
# (Gemini genuinely added/changed a word) rather than a near-miss spelling variant of the same
# spoken word — tuned loose enough to catch things like a leftover diacritic mismatch that
# survived spelling_correction, tight enough not to pair genuinely different short words.
_FUZZY_MATCH_THRESHOLD = 0.5


def _normalize(text: str) -> str:
    return _TOKEN_RE.sub("", text.lower())


def _similarity(a: str, b: str) -> float:
    if not a or not b:
        return 0.0
    return difflib.SequenceMatcher(None, a, b, autojunk=False).ratio()


def _align_words(whisper_words: list[Word], gemini_words: list[Word]) -> list[Word]:
    if not gemini_words:
        return []
    if not whisper_words:
        return list(gemini_words)

    w_norm = [_normalize(w.text) for w in whisper_words]
    g_norm = [_normalize(w.text) for w in gemini_words]
    matcher = difflib.SequenceMatcher(None, w_norm, g_norm, autojunk=False)

    anchors: list[tuple[float, float] | None] = [None] * len(gemini_words)
    for tag, i1, i2, j1, j2 in matcher.get_opcodes():
        if tag == "equal":
            for k in range(j2 - j1):
                anchors[j1 + k] = (whisper_words[i1 + k].start, whisper_words[i1 + k].end)
        elif tag == "replace":
            # A "replace" block usually still holds the same spoken words, just spelled/
            # rewritten differently (e.g. a near-miss that slipped past spelling_correction) —
            # not genuinely different content the way an "insert"/"delete" block is. Pairing
            # each Gemini word here with its closest not-yet-used Whisper word by character
            # similarity gives it a real timestamp instead of pure interpolation whenever a
            # plausible match exists, which is what was causing kinetic typography (one word
            # on screen at a time, so any timing slop is immediately visible) to drift ahead of
            # or behind the audio even though the coarser subtitle cues looked fine.
            used_whisper = set()
            for gj in range(j1, j2):
                best_wi, best_score = None, _FUZZY_MATCH_THRESHOLD
                for wi in range(i1, i2):
                    if wi in used_whisper:
                        continue
                    score = _similarity(w_norm[wi], g_norm[gj])
                    if score > best_score:
                        best_score, best_wi = score, wi
                if best_wi is not None:
                    used_whisper.add(best_wi)
                    anchors[gj] = (whisper_words[best_wi].start, whisper_words[best_wi].end)

    audio_end_fallback = whisper_words[-1].end
    result: list[Word] = []
    n = len(gemini_words)
    i = 0
    while i < n:
        if anchors[i] is not None:
            start, end = anchors[i]
            result.append(Word(text=gemini_words[i].text, start=start, end=end))
            i += 1
            continue

        j = i
        while j < n and anchors[j] is None:
            j += 1

        left_bound = result[-1].end if result else 0.0
        right_bound = anchors[j][0] if j < n else max(left_bound + 0.05, audio_end_fallback)
        if right_bound < left_bound:
            right_bound = left_bound

        block = gemini_words[i:j]
        total_len = sum(max(len(w.text), 1) for w in block) or 1
        span = max(right_bound - left_bound, 0.01)
        cursor = left_bound
        for w in block:
            portion = span * (max(len(w.text), 1) / total_len)
            w_start = cursor
            w_end = min(right_bound, cursor + portion)
            result.append(Word(text=w.text, start=w_start, end=max(w_end, w_start)))
            cursor = w_end
        i = j

    return result


def _rebuild_segments(gemini_segments: list[Segment], aligned_words: list[Word]) -> list[Segment]:
    segments: list[Segment] = []
    cursor = 0
    for seg in gemini_segments:
        count = len(seg.text.split())
        seg_words = aligned_words[cursor:cursor + count]
        cursor += count
        if seg_words:
            # Rebuilt from aligned_words (spelling-corrected in transcribe() below), not the
            # original seg.text -- otherwise a segment's displayed text would silently keep
            # showing the pre-correction spelling regardless of what the words got corrected to.
            text = " ".join(w.text for w in seg_words)
            segments.append(Segment(text=text, start=seg_words[0].start, end=seg_words[-1].end))
        else:
            segments.append(seg)
    return segments


def transcribe(audio_path: Path) -> TranscriptionResult:
    with ThreadPoolExecutor(max_workers=2) as pool:
        whisper_future = pool.submit(transcriber.transcribe, audio_path)
        gemini_future = pool.submit(gemini_transcriber.transcribe, audio_path)
        whisper_result = whisper_future.result()
        try:
            gemini_result = gemini_future.result()
        except Exception:
            # Gemini only adds spelling correction on top of Whisper's own real timestamps
            # (see module docstring) -- if it's unavailable (rate limit, outage), Whisper's own
            # result is still a complete, usable transcription on its own, so degrade to that
            # instead of failing the whole request.
            logging.getLogger(__name__).warning(
                "Gemini transcription failed, falling back to Whisper-only result", exc_info=True)
            return whisper_result

    # gemini_words' TEXT (not whisper_words') is what ends up in the final result below --
    # _align_words keeps whichever word came from Gemini, only borrowing Whisper's timestamp.
    # Gemini's own direct transcription can leak the same Turkish-style Uzbek spelling Whisper
    # does (see spelling_correction.py's module docstring for examples) -- transcriber.py's
    # Whisper path already runs every word through this same correction pass, but that pass had
    # no effect on the actual displayed text here, since Whisper's corrected words are discarded
    # in favor of Gemini's uncorrected ones. Correcting Gemini's words directly closes that gap.
    corrected_texts = spelling_correction.correct_words([w.text for w in gemini_result.words])
    gemini_words = [
        Word(text=t, start=w.start, end=w.end)
        for t, w in zip(corrected_texts, gemini_result.words)
    ]

    aligned_words = _align_words(whisper_result.words, gemini_words)
    segments = _rebuild_segments(gemini_result.segments, aligned_words)
    return TranscriptionResult(words=aligned_words, segments=segments)
