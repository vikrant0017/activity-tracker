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

[coach.breaks]
# Set to true to receive gentle desktop break reminders.
enabled = false
active_after_seconds = 3000
break_seconds = 300
snooze_seconds = 600
'''


@dataclass(frozen=True, slots=True)
class Settings:
    idle_after: timedelta = timedelta(minutes=5)
    dashboard_host: str = '127.0.0.1'
    dashboard_port: int = 8765
    break_coach_enabled: bool = False
    break_active_after: timedelta = timedelta(minutes=50)
    break_duration: timedelta = timedelta(minutes=5)
    break_snooze: timedelta = timedelta(minutes=10)


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


def _boolean(value: Any, name: str) -> bool:
    if not isinstance(value, bool):
        raise TypeError(f'{name} must be true or false')
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
    coach = document.get('coach', {})
    breaks = coach.get('breaks', {}) if isinstance(coach, dict) else {}
    if not isinstance(activity, dict) or not isinstance(dashboard, dict) or not isinstance(breaks, dict):
        raise TypeError('activity, dashboard, and coach.breaks settings must be TOML tables')
    return Settings(
        idle_after=timedelta(seconds=_positive_seconds(activity.get('idle_after_seconds', 300), 'activity.idle_after_seconds')),
        dashboard_host=str(dashboard.get('host', '127.0.0.1')),
        dashboard_port=_port(dashboard.get('port', 8765)),
        break_coach_enabled=_boolean(breaks.get('enabled', False), 'coach.breaks.enabled'),
        break_active_after=timedelta(seconds=_positive_seconds(breaks.get('active_after_seconds', 3000), 'coach.breaks.active_after_seconds')),
        break_duration=timedelta(seconds=_positive_seconds(breaks.get('break_seconds', 300), 'coach.breaks.break_seconds')),
        break_snooze=timedelta(seconds=_positive_seconds(breaks.get('snooze_seconds', 600), 'coach.breaks.snooze_seconds')),
    )


def write_settings(settings: Settings, path: Path | None = None) -> Path:
    """Persist all supported settings in a stable, human-editable TOML document."""
    path = path or config_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        '[activity]\n'
        f'idle_after_seconds = {int(settings.idle_after.total_seconds())}\n\n'
        '[dashboard]\n'
        f'host = {settings.dashboard_host!r}\n'
        f'port = {settings.dashboard_port}\n\n'
        '[coach.breaks]\n'
        f'enabled = {str(settings.break_coach_enabled).lower()}\n'
        f'active_after_seconds = {int(settings.break_active_after.total_seconds())}\n'
        f'break_seconds = {int(settings.break_duration.total_seconds())}\n'
        f'snooze_seconds = {int(settings.break_snooze.total_seconds())}\n'
    )
    return path


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
