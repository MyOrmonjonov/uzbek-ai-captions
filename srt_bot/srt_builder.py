import textwrap
from dataclasses import dataclass, field

from transcriber import TranscriptionResult, Word

MIN_CUE_DURATION = 0.8
INTER_CUE_GAP = 0.08

STYLE_PARAMS = {
    "1": dict(max_lines=1, max_chars_per_line=26, max_cue_duration=3.0),
    "2": dict(max_lines=2, max_chars_per_line=40, max_cue_duration=5.0),
    "3": dict(max_lines=3, max_chars_per_line=40, max_cue_duration=7.0),
}

PREMIUM_MAX_LINES = 2
PREMIUM_MAX_CHARS_PER_LINE = 42


@dataclass
class Cue:
    start: float
    end: float
    lines: list[str] = field(default_factory=list)


def format_timestamp(seconds: float) -> str:
    seconds = max(seconds, 0.0)
    total_ms = round(seconds * 1000)
    hours, rem = divmod(total_ms, 3_600_000)
    minutes, rem = divmod(rem, 60_000)
    secs, ms = divmod(rem, 1000)
    return f"{hours:02d}:{minutes:02d}:{secs:02d},{ms:03d}"


def pack_words(
    words: list[Word],
    max_lines: int,
    max_chars_per_line: int,
    max_cue_duration: float,
    pause_break_s: float = 0.6,
) -> list[Cue]:
    total_chars_budget = max_lines * max_chars_per_line
    cues: list[Cue] = []

    cue_start: float | None = None
    cue_end: float | None = None
    lines: list[list[str]] = [[]]
    line_chars: list[int] = [0]
    prev_word_end: float | None = None

    def finalize() -> None:
        nonlocal cue_start, cue_end, lines, line_chars
        if cue_start is None:
            return
        text_lines = [" ".join(l) for l in lines if l]
        if text_lines:
            end = max(cue_end, cue_start + MIN_CUE_DURATION)
            cues.append(Cue(start=cue_start, end=end, lines=text_lines))
        cue_start = None
        cue_end = None
        lines = [[]]
        line_chars = [0]

    for w in words:
        text = w.text
        if not text:
            continue

        if cue_start is not None:
            gap_break = prev_word_end is not None and (w.start - prev_word_end) > pause_break_s
            duration_break = (w.end - cue_start) > max_cue_duration
            if gap_break or duration_break:
                finalize()

        if cue_start is None:
            cue_start = w.start
            lines = [[]]
            line_chars = [0]

        cur_chars = line_chars[-1]
        candidate_len = len(text) if cur_chars == 0 else cur_chars + 1 + len(text)

        if cur_chars == 0 or candidate_len <= max_chars_per_line:
            lines[-1].append(text)
            line_chars[-1] = candidate_len
        elif len(lines) < max_lines:
            lines.append([text])
            line_chars.append(len(text))
        else:
            finalize()
            cue_start = w.start
            lines = [[text]]
            line_chars = [len(text)]

        cue_end = w.end
        prev_word_end = w.end

        if text[-1] in ".!?" and sum(line_chars) >= total_chars_budget * 0.6:
            finalize()
            prev_word_end = None

    finalize()
    return cues


def wrap_text(text: str, max_lines: int, max_chars_per_line: int) -> list[str]:
    lines = textwrap.wrap(text, width=max_chars_per_line, break_long_words=False, break_on_hyphens=False)
    if not lines:
        return []
    if len(lines) > max_lines:
        head = lines[: max_lines - 1]
        tail = " ".join(lines[max_lines - 1 :])
        lines = head + [tail]
    return lines


def _fix_overlaps(cues: list[Cue]) -> list[Cue]:
    for i in range(len(cues) - 1):
        next_start = cues[i + 1].start
        if cues[i].end > next_start - INTER_CUE_GAP:
            cues[i].end = max(cues[i].start + 0.1, next_start - INTER_CUE_GAP)
    return cues


def render_srt(cues: list[Cue]) -> str:
    out: list[str] = []
    for i, cue in enumerate(cues, start=1):
        out.append(str(i))
        out.append(f"{format_timestamp(cue.start)} --> {format_timestamp(cue.end)}")
        out.extend(cue.lines)
        out.append("")
    return "\n".join(out).strip() + "\n"


def build_srt(result: TranscriptionResult, style: str) -> str:
    if style == "premium":
        cues = []
        for seg in result.segments:
            lines = wrap_text(seg.text, PREMIUM_MAX_LINES, PREMIUM_MAX_CHARS_PER_LINE)
            if lines:
                cues.append(Cue(start=seg.start, end=seg.end, lines=lines))
    else:
        cues = pack_words(result.words, **STYLE_PARAMS[style])

    cues = _fix_overlaps(cues)
    return render_srt(cues)
