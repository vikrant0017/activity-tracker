#!/usr/bin/env python3
"""Build the React dashboard and copy it into the Python package resources."""

from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FRONTEND = ROOT / "frontend"
DIST = FRONTEND / "dist"
PACKAGE_STATIC = ROOT / "src" / "activity_tracker" / "web" / "static"


def main() -> None:
    if not (FRONTEND / "package.json").is_file():
        raise SystemExit(f"Frontend package manifest not found: {FRONTEND / 'package.json'}")

    subprocess.run(["npm", "ci"], cwd=FRONTEND, check=True)
    subprocess.run(["npm", "run", "build"], cwd=FRONTEND, check=True)

    if not DIST.is_dir():
        raise SystemExit(f"Frontend build did not produce {DIST}")

    if PACKAGE_STATIC.exists():
        shutil.rmtree(PACKAGE_STATIC)
    shutil.copytree(DIST, PACKAGE_STATIC)
    print(f"Copied frontend assets to {PACKAGE_STATIC.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
