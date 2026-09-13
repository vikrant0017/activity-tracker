#!/bin/sh
set -eu

project_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
pid_file="$project_dir/.dev-data/widget-dashboard.pid"
api_port="${ACTIVITY_TRACKER_DEV_API_PORT:-8766}"
export ACTIVITY_TRACKER_API_URL="http://127.0.0.1:$api_port"
export ACTIVITY_TRACKER_GUIDE_URL="http://127.0.0.1:5173"

start_dashboard() {
  setsid "$project_dir/scripts/dev.sh" activity-tracker-dashboard --collector --port "$api_port" &
  dashboard_pid=$!
  printf '%s\n' "$dashboard_pid" > "$pid_file"
}

start_coach() {
  setsid "$project_dir/scripts/dev.sh" activity-tracker-coach &
  coach_pid=$!
}

stop_dashboard() {
  if [ -f "$pid_file" ]; then
    kill -TERM -- "-$(cat "$pid_file")" 2>/dev/null || true
  fi
}

stop_coach() {
  kill -TERM -- "-$coach_pid" 2>/dev/null || true
}

watch_backend() {
  while inotifywait --quiet --recursive --event close_write,move,create,delete "$project_dir/src/activity_tracker"; do
    stop_dashboard
    start_dashboard
  done
}

cleanup() {
  kill "$watcher_pid" 2>/dev/null || true
  stop_dashboard
  stop_coach
  kill -TERM -- "-$vite_pid" 2>/dev/null || true
}

mkdir -p "$project_dir/.dev-data"
start_dashboard
start_coach
watch_backend &
watcher_pid=$!
trap cleanup EXIT INT TERM

cd "$project_dir/frontend"
setsid npm run dev -- --host 127.0.0.1 --strictPort &
vite_pid=$!
wait "$vite_pid"
