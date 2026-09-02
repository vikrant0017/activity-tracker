"""Install and manage the Activity Tracker systemd user service."""

import argparse
import shutil
import subprocess
import sys
from importlib.resources import files
from pathlib import Path

SERVICE_NAME = 'activity-tracker.service'


def service_path() -> Path:
    return Path.home() / '.config' / 'systemd' / 'user' / SERVICE_NAME


def collector_executable() -> str:
    sibling = Path(sys.executable).with_name('activity-tracker')
    if sibling.is_file():
        return str(sibling)
    command = shutil.which('activity-tracker')
    if command is None:
        raise RuntimeError('activity-tracker is not installed or available on PATH')
    return command


def systemctl(*args: str) -> None:
    command = shutil.which('systemctl')
    if command is None:
        raise RuntimeError('systemctl is required to manage the user service')
    subprocess.run([command, '--user', *args], check=True)


def install() -> Path:
    template = files('activity_tracker').joinpath('resources', 'systemd', SERVICE_NAME).read_text()
    destination = service_path()
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(template.replace('@COLLECTOR_COMMAND@', collector_executable()))
    systemctl('daemon-reload')
    systemctl('enable', '--now', SERVICE_NAME)
    return destination


def uninstall() -> None:
    systemctl('disable', '--now', SERVICE_NAME)
    path = service_path()
    if path.exists():
        path.unlink()
    systemctl('daemon-reload')


def main() -> None:
    parser = argparse.ArgumentParser(description='Manage the Activity Tracker systemd user service.')
    parser.add_argument('command', choices=('install', 'uninstall', 'start', 'stop', 'restart', 'status', 'path'))
    args = parser.parse_args()
    if args.command == 'install':
        print(install())
    elif args.command == 'uninstall':
        uninstall()
    elif args.command == 'path':
        print(service_path())
    else:
        systemctl(args.command, SERVICE_NAME)
