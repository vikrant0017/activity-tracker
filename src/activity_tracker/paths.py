"""XDG-compliant locations for Activity Tracker user data and configuration."""

import os
from pathlib import Path

APP_NAME = "activity-tracker"


def _xdg_directory(variable: str, default: Path) -> Path:
    """Return an XDG directory, accepting an explicit environment override."""
    return Path(os.environ.get(variable, default)).expanduser()


def data_directory() -> Path:
    """Return the per-user directory for persistent application data."""
    return _xdg_directory("XDG_DATA_HOME", Path.home() / ".local" / "share") / APP_NAME


def config_directory() -> Path:
    """Return the per-user directory for application configuration."""
    return _xdg_directory("XDG_CONFIG_HOME", Path.home() / ".config") / APP_NAME


def state_directory() -> Path:
    """Return the per-user directory for logs and other mutable state."""
    return _xdg_directory("XDG_STATE_HOME", Path.home() / ".local" / "state") / APP_NAME


def database_path() -> Path:
    """Return the SQLite database location, creating its parent on first use."""
    path = Path(os.environ.get("ACTIVITY_TRACKER_DATABASE", data_directory() / "events.db"))
    path = path.expanduser()
    path.parent.mkdir(parents=True, exist_ok=True)
    return path
