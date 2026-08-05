import subprocess
from pathlib import Path

import imageio_ffmpeg


def get_ffmpeg_path() -> str:
    return imageio_ffmpeg.get_ffmpeg_exe()


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
