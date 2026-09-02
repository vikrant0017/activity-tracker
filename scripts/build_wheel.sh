#!/bin/sh
set -eu

project_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
python "$project_dir/scripts/build_frontend.py"
cd "$project_dir"
uv build
