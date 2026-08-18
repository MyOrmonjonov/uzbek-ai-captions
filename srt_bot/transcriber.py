import re
from dataclasses import dataclass
from pathlib import Path

from faster_whisper import WhisperModel

import config
import spelling_correction

_model: WhisperModel | None = None

# Whisper's Uzbek output comes out in Cyrillic (that's what dominates its training data) —
# it can't be prompted to switch script the way an LLM like Gemini can, so we transliterate
# to the standard Uzbek Latin alphabet ourselves after the fact.
_CYRILLIC_TO_LATIN_UZ = {
    "а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "е": "e", "ё": "yo",
    "ж": "j", "з": "z", "и": "i", "й": "y", "к": "k", "л": "l", "м": "m",
    "н": "n", "о": "o", "п": "p", "р": "r", "с": "s", "т": "t", "у": "u",
    "ф": "f", "х": "x", "ц": "ts", "ч": "ch", "ш": "sh", "щ": "sh",
    "ъ": "", "ы": "i", "ь": "", "э": "e", "ю": "yu", "я": "ya",
    "ў": "o'", "қ": "q", "ғ": "g'", "ҳ": "h",
    "А": "A", "Б": "B", "В": "V", "Г": "G", "Д": "D", "Е": "E", "Ё": "Yo",
    "Ж": "J", "З": "Z", "И": "I", "Й": "Y", "К": "K", "Л": "L", "М": "M",
    "Н": "N", "О": "O", "П": "P", "Р": "R", "С": "S", "Т": "T", "У": "U",
    "Ф": "F", "Х": "X", "Ц": "Ts", "Ч": "Ch", "Ш": "Sh", "Щ": "Sh",
    "Ъ": "", "Ы": "I", "Ь": "", "Э": "E", "Ю": "Yu", "Я": "Ya",
    "Ў": "O'", "Қ": "Q", "Ғ": "G'", "Ҳ": "H",
}
_CYRILLIC_RE = re.compile(r"[Ѐ-ӿ]")


def _cyrillic_to_latin_uz(text: str) -> str:
    if not _CYRILLIC_RE.search(text):
        return text
    return "".join(_CYRILLIC_TO_LATIN_UZ.get(ch, ch) for ch in text)


def get_model() -> WhisperModel:
    global _model
    if _model is None:
        _model = WhisperModel(
            config.WHISPER_MODEL_SIZE,
            device=config.WHISPER_DEVICE,
            compute_type=config.WHISPER_COMPUTE_TYPE,
        )
    return _model


@dataclass
class Word:
    text: str
    start: float
    end: float


@dataclass
class Segment:
    text: str
    start: float
    end: float


@dataclass
class TranscriptionResult:
    words: list[Word]
    segments: list[Segment]


def transcribe(audio_path: Path) -> TranscriptionResult:
    model = get_model()
    segments_iter, _info = model.transcribe(
        str(audio_path),
        word_timestamps=True,
        vad_filter=True,
        beam_size=5,
        language=config.WHISPER_LANGUAGE,
        condition_on_previous_text=False,
        hallucination_silence_threshold=2.0,
    )

    raw_segments = []
    words: list[Word] = []
    for seg in segments_iter:
        seg_words: list[Word] = []
        if seg.words:
            for w in seg.words:
                seg_words.append(Word(text=_cyrillic_to_latin_uz(w.word.strip()), start=w.start, end=w.end))
        raw_segments.append((seg, seg_words))
        words.extend(seg_words)

    # This correction's own output isn't what ends up in the final displayed captions (see
    # hybrid_transcriber.py -- it keeps Gemini's word text, only Whisper's timestamps), but
    # LEAVING these words uncorrected is worse than wasting the API call: hybrid_transcriber's
    # _align_words() fuzzy-matches these against Gemini's (now spelling-corrected) words to
    # anchor each one to a real timestamp, and comparing Whisper's raw Turkish-leaked spelling
    # against Gemini's clean spelling measurably degrades that match on a long transcript --
    # confirmed as the cause of captions drifting out of sync partway through a video (more
    # words fall back to interpolated-instead-of-real timing as match quality drops, and that
    # drift compounds the further into the transcript you go). Keeping both sides similarly
    # clean is what keeps the alignment accurate.
    corrected_texts = spelling_correction.correct_words([w.text for w in words])
    for w, corrected in zip(words, corrected_texts):
        w.text = corrected

    segments: list[Segment] = []
    for seg, seg_words in raw_segments:
        if seg_words:
            seg_text = " ".join(w.text for w in seg_words)
        else:
            seg_text = _cyrillic_to_latin_uz(seg.text.strip())
        segments.append(Segment(text=seg_text, start=seg.start, end=seg.end))

    return TranscriptionResult(words=words, segments=segments)
