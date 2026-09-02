# Activity Tracker

A local-first Linux activity tracker for Hyprland. It records `activewindow` events from Hyprland's `socket2`, stores them in SQLite, and presents aggregate activity through a browser dashboard and optional Omarchy bar widget.

> **Privacy:** activity data remains in the local SQLite database. The dashboard binds to `127.0.0.1` by default and does not transmit collected activity elsewhere.

## Requirements

- Linux with a running Hyprland session
- Python 3.13+
- [uv](https://docs.astral.sh/uv/)
- Node.js 22+ and npm for dashboard development or release builds
- Optional: Omarchy for the bar-widget integration

## Repository layout

```text
src/activity_tracker/    Python collector, SQLite store, analytics, and local dashboard API
frontend/                React/Vite dashboard source
omarchy-plugin/          Optional Omarchy bar-widget source
scripts/                 Reproducible frontend and wheel build scripts
```

## Development

Install the Python environment and run the collector:

```sh
uv sync
uv run activity-tracker
```

In another terminal, run the dashboard API and Vite development server:

```sh
uv run activity-tracker-dashboard
cd frontend
npm ci
npm run dev
```

Vite proxies `/api` and `/events` to the local dashboard API at `http://127.0.0.1:8765`.

### Commands

```sh
uv run activity-tracker
uv run activity-tracker-stats
uv run activity-tracker-dashboard
uv run activity-tracker-bar-stats
uv run activity-tracker-open-dashboard
```

The dashboard starts the collector by default. Do not separately run `activity-tracker` while using this development mode, otherwise every event is recorded twice. Pass `--no-collector` to view an existing database without starting the collector.

Enable diagnostic console output with `ACTIVITY_TRACKER_DEBUG=1`:

```sh
ACTIVITY_TRACKER_DEBUG=1 uv run activity-tracker-dashboard
```

## Runtime data and configuration

The application follows the XDG base-directory convention:

| Resource | Default location | Override |
| --- | --- | --- |
| SQLite database | `${XDG_DATA_HOME:-~/.local/share}/activity-tracker/events.db` | `ACTIVITY_TRACKER_DATABASE` |
| Future configuration | `${XDG_CONFIG_HOME:-~/.config}/activity-tracker/` | `XDG_CONFIG_HOME` |
| Future logs/state | `${XDG_STATE_HOME:-~/.local/state}/activity-tracker/` | `XDG_STATE_HOME` |

This means installation never writes data beside the application source or wheel.

## Build a distributable wheel

The wheel bundles the dashboard's compiled static assets. From the repository root:

```sh
./scripts/build_wheel.sh
```

The script runs `npm ci` and `npm run build` in `frontend/`, copies the resulting assets to `src/activity_tracker/web/static/`, then invokes `uv build`. The generated wheel and source archive are written to `dist/`.

For only the frontend asset step:

```sh
python scripts/build_frontend.py
```

## Omarchy widget

The optional widget source is in `omarchy-plugin/`. It requests compact live stats from the local dashboard at `http://127.0.0.1:8765/api/bar-stats`.

Install it into:

```text
~/.config/omarchy/plugins/vikrant.activity-tracker/
```

Then add it to the desired `bar.layout` section in `~/.config/omarchy/shell.json`. Its dashboard action runs the installed `activity-tracker-open-dashboard` command, so it no longer depends on a source-checkout path.

## Categories and idle time

Apps may have multiple categories. A rule can apply to every title for an application class, or only when the title contains a case-insensitive phrase. Hyprland active-window events do not contain browser URLs, so URL categorization is unavailable.

Focus sessions end when focus changes. Active duration is capped at five minutes by default; remaining gaps are reported as **simple idle time**. This is a lightweight heuristic because Hyprland socket events do not report keyboard or mouse idle state.
