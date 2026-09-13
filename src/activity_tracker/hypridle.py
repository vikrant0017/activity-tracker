"""Hypridle callback and configuration support for Activity Tracker."""

import argparse
import re
import shlex
import shutil
import sys
from pathlib import Path

from activity_tracker.config import load_settings
from activity_tracker.database import SQLiteEventStore

BLOCK_START = '# >>> activity-tracker hypridle >>>'
BLOCK_END = '# <<< activity-tracker hypridle <<<'


def default_config_path() -> Path:
    return Path.home() / '.config' / 'hypr' / 'hypridle.conf'


def callback_executable() -> str:
    sibling = Path(sys.executable).with_name('activity-tracker-hypridle')
    if sibling.is_file():
        return str(sibling)
    command = shutil.which('activity-tracker-hypridle')
    if command is None:
        raise RuntimeError('activity-tracker-hypridle is not available on PATH')
    return command


def listener_block(timeout: float, executable: str) -> str:
    command = shlex.quote(executable)
    timeout_text = f'{timeout:g}'
    return f'''{BLOCK_START}
# Records Hypridle-confirmed idle periods for Activity Tracker.
listener {{
    timeout = {timeout_text}
    on-timeout = {command} start
    on-resume = {command} resume
}}
{BLOCK_END}
'''


def _remove_block(text: str) -> tuple[str, bool]:
    pattern = re.compile(
        rf'(?ms)^{re.escape(BLOCK_START)}\n.*?^{re.escape(BLOCK_END)}\n?'
    )
    updated, replacements = pattern.subn('', text)
    if BLOCK_START in updated or BLOCK_END in updated:
        raise ValueError('found an incomplete Activity Tracker Hypridle block; repair it manually first')
    return updated, replacements > 0


def install_listener(path: Path, timeout: float, executable: str | None = None) -> Path:
    if timeout <= 0:
        raise ValueError('timeout must be greater than zero')
    existing = path.read_text() if path.exists() else ''
    without_block, _ = _remove_block(existing)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(f'{without_block.rstrip()}\n\n{listener_block(timeout, executable or callback_executable())}')
    return path


def uninstall_listener(path: Path) -> bool:
    if not path.exists():
        return False
    updated, removed = _remove_block(path.read_text())
    if removed:
        path.write_text(updated.rstrip() + ('\n' if updated.strip() else ''))
    return removed


def positive_seconds(value: str) -> float:
    try:
        seconds = float(value)
    except ValueError as error:
        raise argparse.ArgumentTypeError('must be a number') from error
    if seconds <= 0:
        raise argparse.ArgumentTypeError('must be greater than zero')
    return seconds


def main() -> None:
    parser = argparse.ArgumentParser(description='Record Hypridle idle periods and manage its tracker listener.')
    subcommands = parser.add_subparsers(dest='command', required=True)
    subcommands.add_parser('start', help='record the beginning of an idle period')
    subcommands.add_parser('resume', help='record the end of the current idle period')
    for command in ('install', 'uninstall'):
        subcommand = subcommands.add_parser(command)
        subcommand.add_argument('--config', type=Path, default=default_config_path())
    install = subcommands.choices['install']
    install.add_argument(
        '--timeout', type=positive_seconds, default=load_settings().idle_after.total_seconds(),
        help='Hypridle timeout in seconds (defaults to activity.idle_after_seconds)',
    )
    args = parser.parse_args()

    try:
        if args.command == 'start':
            with SQLiteEventStore() as store:
                store.start_idle_period()
        elif args.command == 'resume':
            with SQLiteEventStore() as store:
                store.end_idle_period()
        elif args.command == 'install':
            print(install_listener(args.config, args.timeout))
        else:
            uninstall_listener(args.config)
    except (OSError, RuntimeError, ValueError) as error:
        parser.exit(1, f'error: {error}\n')


if __name__ == '__main__':
    main()
