#!/bin/sh
set -eu

project_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
export XDG_DATA_HOME="$project_dir/.dev-data"
export XDG_CONFIG_HOME="$project_dir/.dev-config"

exec uv run "$@"
