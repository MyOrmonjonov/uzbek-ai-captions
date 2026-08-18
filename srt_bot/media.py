import re
import subprocess
from pathlib import Path

import imageio_ffmpeg

_DURATION_RE = re.compile(r"Duration:\s*(\d+):(\d+):(\d+)\.(\d+)")


def get_ffmpeg_path() -> str:
    return imageio_ffmpeg.get_ffmpeg_exe()


def get_duration_seconds(path: Path) -> float:
    """ffprobe isn't bundled (only ffmpeg is), so duration comes from parsing `ffmpeg -i
    <path>`'s own stderr stream description -- that invocation always exits non-zero (no
    output given), which is fine here, the duration line is printed before ffmpeg gives up
    regardless of exit code."""
    ffmpeg = get_ffmpeg_path()
    result = subprocess.run([ffmpeg, "-i", str(path)], capture_output=True)
    output = result.stderr.decode(errors="ignore")
    match = _DURATION_RE.search(output)
    if not match:
        return 0.0
    hours, minutes, seconds, centis = (int(g) for g in match.groups())
    return hours * 3600 + minutes * 60 + seconds + centis / 100


def extract_audio_chunk(input_path: Path, output_path: Path, start_seconds: float, duration_seconds: float) -> None:
    """Extracts [start_seconds, start_seconds + duration_seconds) from a WAV/audio file into
    output_path. -c copy (not a re-encode) since the source is already the mono 16kHz WAV
    extract_audio() below produces -- PCM audio has no keyframe-alignment concerns a video
    stream would, so an exact-sample cut on -ss/-t is safe here."""
    ffmpeg = get_ffmpeg_path()
    result = subprocess.run(
        [
            ffmpeg, "-y",
            "-ss", str(start_seconds), "-t", str(duration_seconds),
            "-i", str(input_path),
            "-c", "copy",
            str(output_path),
        ],
        capture_output=True,
    )
    if result.returncode != 0:
        raise RuntimeError(
            f"ffmpeg audio bo'laklashda xatolik:\n{result.stderr.decode(errors='ignore')}"
        )


def extract_audio(input_path: Path, output_path: Path) -> None:
    """Convert any input media file to mono 16kHz WAV for Whisper."""
    ffmpeg = get_ffmpeg_path()
    result = subprocess.run(
        [
            ffmpeg,
            "-y",
            "-i", str(input_path),
            "-avoid_negative_ts", "make_zero",
            "-ac", "1",
            "-ar", "16000",
            "-vn",
            str(output_path),
        ],
        capture_output=True,
    )
    if result.returncode != 0:
        raise RuntimeError(
            f"ffmpeg audio ajratishda xatolik:\n{result.stderr.decode(errors='ignore')}"
        )
