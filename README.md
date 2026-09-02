# Activity Tracker

A local-first Linux activity tracker for Hyprland. It records `activewindow` events from Hyprland's `socket2`, stores them in SQLite, and presents aggregate activity through a browser dashboard and optional Omarchy bar widget.

> **Privacy:** activity data remains in the local SQLite database. The dashboard binds to `127.0.0.1` by default and does not transmit collected activity elsewhere.

## Requirements

- Linux with a running Hyprland session
- Python 3.13+
- [uv](https://docs.astral.sh/uv/)
- Node.js 22+ and npm for dashboard development or release builds
- Optional: Omarchy for the bar-widget integration

## Install

### Omarchy widget (recommended for Omarchy users)

Install the widget through Omarchy's plugin manager:

```sh
omarchy plugin add \
  https://github.com/vikrant0017/activity-tracker-omarchy-plugin.git \
  --enable
```

Open the widget popup and select **Open dashboard**. On first use, it downloads the checksum-verified wheel from this repository's GitHub Release, installs it with `uv tool`, enables the collector user service, and opens the local dashboard.

This path requires `uv` and `curl` on `PATH`. Activity data remains local in `~/.local/share/activity-tracker/`.

### Manual GitHub Release installation

Install the released wheel directly with `uv`:

```sh
uv tool install --from \
  https://github.com/vikrant0017/activity-tracker/releases/download/v0.1.1/activity_tracker-0.1.1-py3-none-any.whl \
  activity-tracker
```

Enable reliable background collection in your active Hyprland session:

```sh
systemctl --user import-environment XDG_RUNTIME_DIR HYPRLAND_INSTANCE_SIGNATURE
activity-tracker-service install
```

Open the local dashboard:

```sh
activity-tracker-open-dashboard
```

After installing the service, check the installation at any time:

```sh
activity-tracker-service status
activity-tracker-stats
```

To remove the installed runtime and service:

```sh
activity-tracker-service uninstall
uv tool uninstall activity-tracker
```

## Repository layout

```text
src/activity_tracker/    Python collector, SQLite store, analytics, dashboard API, and systemd resources
frontend/                React/Vite dashboard source
scripts/                 Reproducible frontend and wheel build scripts
```

## Development

Install the Python environment and run development commands through the repository wrapper. It keeps development events and configuration in `.dev-data/` and `.dev-config/`, isolated from the installed application's XDG user data:

```sh
uv sync
./scripts/dev.sh activity-tracker
```

In another terminal, run the dashboard API and Vite development server. During development, use `--collector` only if the standalone collector is not already running:

```sh
./scripts/dev.sh activity-tracker-dashboard --collector
cd frontend
npm ci
npm run dev
```

Vite proxies `/api` and `/events` to the local dashboard API at `http://127.0.0.1:8765`.

### Development commands

Prefix local application commands with the wrapper to preserve isolation from the installed application's data:

```sh
./scripts/dev.sh activity-tracker
./scripts/dev.sh activity-tracker-stats
./scripts/dev.sh activity-tracker-dashboard
./scripts/dev.sh activity-tracker-bar-stats
```

Service and browser-launcher commands are for an installed application:

```sh
activity-tracker-open-dashboard
activity-tracker-config init
activity-tracker-service install
```

The dashboard does **not** start a collector by default. For a reliable installed setup, use `activity-tracker-service install`; it enables the collector as a systemd user service. Use `--collector` only for an all-in-one development session.

Before enabling the service for the first time, ensure your user service manager has the active Hyprland session variables:

```sh
systemctl --user import-environment XDG_RUNTIME_DIR HYPRLAND_INSTANCE_SIGNATURE
activity-tracker-service install
```

Use `activity-tracker-service status`, `stop`, `restart`, or `uninstall` to manage it afterward.

Enable diagnostic console output with `ACTIVITY_TRACKER_DEBUG=1`:

```sh
ACTIVITY_TRACKER_DEBUG=1 ./scripts/dev.sh activity-tracker-dashboard
```

## Runtime data and configuration

The application follows the XDG base-directory convention:

| Resource | Default location | Override |
| --- | --- | --- |
| SQLite database | `${XDG_DATA_HOME:-~/.local/share}/activity-tracker/events.db` | `ACTIVITY_TRACKER_DATABASE` |
| Future configuration | `${XDG_CONFIG_HOME:-~/.config}/activity-tracker/` | `XDG_CONFIG_HOME` |
| Future logs/state | `${XDG_STATE_HOME:-~/.local/state}/activity-tracker/` | `XDG_STATE_HOME` |

This means installation never writes data beside the application source or wheel. Create and inspect the optional configuration file with:

```sh
activity-tracker-config init
activity-tracker-config show
```

The default file contains the idle cutoff plus local dashboard host and port settings.

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

The Omarchy widget is distributed separately so it can be installed through Omarchy's plugin manager:

```sh
omarchy plugin add https://github.com/vikrant0017/activity-tracker-omarchy-plugin.git --enable
```

On first use, the widget downloads the checksum-verified wheel from this project's GitHub Release, installs it with `uv tool`, enables the user collector service, and opens the local dashboard. See the [plugin repository](https://github.com/vikrant0017/activity-tracker-omarchy-plugin) for prerequisites and widget-specific instructions.

## Categories and idle time

Apps may have multiple categories. A rule can apply to every title for an application class, or only when the title contains a case-insensitive phrase. Hyprland active-window events do not contain browser URLs, so URL categorization is unavailable.

Focus sessions end when focus changes. Active duration is capped at five minutes by default; remaining gaps are reported as **simple idle time**. This is a lightweight heuristic because Hyprland socket events do not report keyboard or mouse idle state.
