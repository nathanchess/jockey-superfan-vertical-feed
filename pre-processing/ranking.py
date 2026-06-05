"""Run repo-root segmentation batch: py ranking.py (from here) or py ..\\ranking.py"""

import runpy
from pathlib import Path

if __name__ == "__main__":
    runpy.run_path(
        str(Path(__file__).resolve().parent.parent / "ranking.py"),
        run_name="__main__",
    )
