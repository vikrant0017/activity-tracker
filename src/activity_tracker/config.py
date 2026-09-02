"""User configuration loaded from the XDG config directory."""

import argparse
import tomllib
from dataclasses import dataclass
from datetime import timedelta
from pathlib import Path
from typing import Any

from activity_tracker.paths import config_directory

CONFIG_FILENAME = 'config.toml'
DEFAULT_CONFIG = '''[activity]
# Time after an active-window event that is counted as idle.
idle_after_seconds = 300

[dashboard]
host = "127.0.0.1"
port = 8765
'''


@dataclass(frozen=True, slots=True)
class Settings:
    idle_after: timedelta = timedelta(minutes=5)
    dashboard_host: str = '127.0.0.1'
    dashboard_port: int = 8765


def config_path() -> Path:
    return config_directory() / CONFIG_FILENAME


def _positive_seconds(value: Any, name: str) -> float:
    if not isinstance(value, (int, float)) or isinstance(value, bool):
        raise TypeError(f'{name} must be a number')
    if value <= 0:
        raise ValueError(f'{name} must be greater than zero')
    return float(value)


def _port(value: Any) -> int:
    if not isinstance(value, int) or isinstance(value, bool):
        raise TypeError('dashboard.port must be an integer')
    if not 1 <= value <= 65_535:
        raise ValueError('dashboard.port must be between 1 and 65535')
    return value


def load_settings(path: Path | None = None) -> Settings:
    """Load user settings, returning defaults when no config file exists."""
    path = path or config_path()
    if not path.exists():
        return Settings()
    try:
        with path.open('rb') as file:
            document = tomllib.load(file)
    except (OSError, tomllib.TOMLDecodeError) as error:
        raise ValueError(f'could not read configuration from {path}: {error}') from error

    activity = document.get('activity', {})
    dashboard = document.get('dashboard', {})
    if not isinstance(activity, dict) or not isinstance(dashboard, dict):
        raise TypeError('activity and dashboard settings must be TOML tables')
    return Settings(
        idle_after=timedelta(seconds=_positive_seconds(activity.get('idle_after_seconds', 300), 'activity.idle_after_seconds')),
        dashboard_host=str(dashboard.get('host', '127.0.0.1')),
        dashboard_port=_port(dashboard.get('port', 8765)),
    )


def write_default_config(path: Path | None = None, *, overwrite: bool = False) -> Path:
    path = path or config_path()
    if path.exists() and not overwrite:
        raise FileExistsError(f'configuration already exists: {path}')
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(DEFAULT_CONFIG)
    return path


def main() -> None:
    parser = argparse.ArgumentParser(description='Manage Activity Tracker configuration.')
    parser.add_argument('command', choices=('init', 'path', 'show'))
    parser.add_argument('--force', action='store_true', help='overwrite an existing config when initializing')
    args = parser.parse_args()
    if args.command == 'init':
        print(write_default_config(overwrite=args.force))
    elif args.command == 'path':
        print(config_path())
    else:
        print(load_settings())
