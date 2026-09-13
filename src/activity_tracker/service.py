"""Install and manage the Activity Tracker systemd user service."""

import argparse
import shutil
import subprocess
import sys
from importlib.resources import files
from pathlib import Path

SERVICE_NAMES = ('activity-tracker.service', 'activity-tracker-coach.service')


def service_path(service_name: str = SERVICE_NAMES[0]) -> Path:
    return Path.home() / '.config' / 'systemd' / 'user' / service_name


def collector_executable() -> str:
    sibling = Path(sys.executable).with_name('activity-tracker')
    if sibling.is_file():
        return str(sibling)
    command = shutil.which('activity-tracker')
    if command is None:
        raise RuntimeError('activity-tracker is not installed or available on PATH')
    return command


def coach_executable() -> str:
    sibling = Path(sys.executable).with_name('activity-tracker-coach')
    if sibling.is_file():
        return str(sibling)
    command = shutil.which('activity-tracker-coach')
    if command is None:
        raise RuntimeError('activity-tracker-coach is not installed or available on PATH')
    return command


def systemctl(*args: str) -> None:
    command = shutil.which('systemctl')
    if command is None:
        raise RuntimeError('systemctl is required to manage the user service')
    subprocess.run([command, '--user', *args], check=True)


def install() -> Path:
    destination = service_path()
    destination.parent.mkdir(parents=True, exist_ok=True)
    replacements = {
        'activity-tracker.service': ('@COLLECTOR_COMMAND@', collector_executable()),
        'activity-tracker-coach.service': ('@COACH_COMMAND@', coach_executable()),
    }
    for service_name, (placeholder, executable) in replacements.items():
        template = files('activity_tracker').joinpath('resources', 'systemd', service_name).read_text()
        service_path(service_name).write_text(template.replace(placeholder, executable))
    systemctl('daemon-reload')
    systemctl('enable', '--now', *SERVICE_NAMES)
    return destination


def uninstall() -> None:
    paths = [service_path(service_name) for service_name in SERVICE_NAMES]
    if not any(path.exists() for path in paths):
        return
    systemctl('disable', '--now', *SERVICE_NAMES)
    for path in paths:
        path.unlink(missing_ok=True)
    systemctl('daemon-reload')


def require_installed() -> None:
    if not service_path().exists():
        raise RuntimeError(
            'Activity Tracker service is not installed. '
            'Run `activity-tracker-service install` first.'
        )


def main() -> None:
    parser = argparse.ArgumentParser(description='Manage the Activity Tracker systemd user service.')
    parser.add_argument('command', choices=('install', 'uninstall', 'start', 'stop', 'restart', 'status', 'path'))
    args = parser.parse_args()
    try:
        if args.command == 'install':
            print(install())
        elif args.command == 'uninstall':
            uninstall()
        elif args.command == 'path':
            print(service_path())
        else:
            require_installed()
            systemctl(args.command, *SERVICE_NAMES)
    except RuntimeError as error:
        parser.exit(1, f'error: {error}\n')
    except subprocess.CalledProcessError as error:
        parser.exit(
            error.returncode,
            'error: systemd could not complete the request. '
            f'Inspect with `journalctl --user -u {SERVICE_NAMES[0]}` or '
            f'`journalctl --user -u {SERVICE_NAMES[1]}`.\n',
        )
