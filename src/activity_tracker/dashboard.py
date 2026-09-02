import argparse
import json
import mimetypes
import re
import shutil
import subprocess
import sys
import threading
import time
import tomllib
from collections import defaultdict
from datetime import datetime, timedelta
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from itertools import pairwise
from pathlib import Path
from typing import Any, cast
from urllib.parse import urlparse

from activity_tracker.bar_stats import bar_stats_payload
from activity_tracker.config import load_settings
from activity_tracker.database import SQLiteEventStore
from activity_tracker.debug import debug
from activity_tracker.main import listen
from activity_tracker.stats import FocusSession, focus_sessions

FRONTEND_DIST = Path(__file__).with_name('web') / 'static'
OMARCHY_THEME_COLORS = Path.home() / '.local' / 'state' / 'omarchy' / 'current' / 'theme' / 'colors.toml'
CSS_COLOR = re.compile(r'^(?:#[0-9a-fA-F]{3,8}|(?:rgb|hsl)a?\([0-9.%\s,+-]+\)|[a-zA-Z]+)$')


def omarchy_theme_payload() -> dict[str, Any]:
    defaults = {
        'background': '#1a1b26',
        'foreground': '#c0caf5',
        'card': '#24283b',
        'card-foreground': '#c0caf5',
        'popover': '#24283b',
        'popover-foreground': '#c0caf5',
        'primary': '#7aa2f7',
        'primary-foreground': '#1a1b26',
        'secondary': '#292e42',
        'secondary-foreground': '#c0caf5',
        'muted': '#24283b',
        'muted-foreground': '#a9b1d6',
        'accent': '#292e42',
        'accent-foreground': '#c0caf5',
        'destructive': '#f7768e',
        'border': '#414868',
        'input': '#414868',
        'ring': '#7aa2f7',
        'chart-1': '#7aa2f7',
        'chart-2': '#9ece6a',
        'chart-3': '#e0af68',
        'chart-4': '#ad8ee6',
        'chart-5': '#449dab',
        'sidebar': '#13141c',
        'sidebar-foreground': '#c0caf5',
        'sidebar-primary': '#7aa2f7',
        'sidebar-primary-foreground': '#1a1b26',
        'sidebar-accent': '#292e42',
        'sidebar-accent-foreground': '#c0caf5',
        'sidebar-border': '#414868',
        'sidebar-ring': '#7aa2f7',
    }
    try:
        with OMARCHY_THEME_COLORS.open('rb') as file:
            palette = tomllib.load(file)
    except (OSError, tomllib.TOMLDecodeError):
        return {'mode': 'dark', 'tokens': defaults}

    colors = {
        key: value
        for key, value in palette.items()
        if isinstance(value, str) and CSS_COLOR.fullmatch(value)
    }

    def color(default: str, *keys: str) -> str:
        return next((colors[key] for key in keys if key in colors), default)

    background = color(defaults['background'], 'background', 'bg', 'color0')
    foreground = color(defaults['foreground'], 'bright_foreground', 'bright_fg', 'foreground', 'fg', 'color15', 'color7')
    muted = color(defaults['border'], 'muted', 'dark_foreground', 'dark_fg', 'color8')
    surface = color(defaults['card'], 'lighter_background', 'lighter_bg', 'background', 'bg', 'color0')
    selection = color(defaults['secondary'], 'selection', 'selection_background', 'muted', 'color8')
    primary = color(defaults['primary'], 'accent', 'blue', 'color4')

    tokens = {
        **defaults,
        'background': background,
        'foreground': foreground,
        'card': surface,
        'card-foreground': foreground,
        'popover': surface,
        'popover-foreground': foreground,
        'primary': primary,
        'primary-foreground': background,
        'secondary': selection,
        'secondary-foreground': foreground,
        'muted': surface,
        'muted-foreground': color(defaults['muted-foreground'], 'foreground', 'fg', 'light_foreground', 'light_fg', 'color7'),
        'accent': selection,
        'accent-foreground': foreground,
        'destructive': color(defaults['destructive'], 'red', 'color1'),
        'border': muted,
        'input': muted,
        'ring': primary,
        'chart-1': color(defaults['chart-1'], 'blue', 'color4'),
        'chart-2': color(defaults['chart-2'], 'green', 'color2'),
        'chart-3': color(defaults['chart-3'], 'yellow', 'orange', 'color3'),
        'chart-4': color(defaults['chart-4'], 'magenta', 'purple', 'color5'),
        'chart-5': color(defaults['chart-5'], 'cyan', 'color6'),
        'sidebar': color(defaults['sidebar'], 'dark_background', 'dark_bg', 'background', 'bg', 'color0'),
        'sidebar-foreground': foreground,
        'sidebar-primary': primary,
        'sidebar-primary-foreground': background,
        'sidebar-accent': selection,
        'sidebar-accent-foreground': foreground,
        'sidebar-border': muted,
        'sidebar-ring': primary,
    }
    mode = str(palette.get('mode', palette.get('theme_type', 'dark'))).lower()
    return {'mode': mode if mode in {'light', 'dark'} else 'dark', 'tokens': tokens}



def session_label(app: str, title: str) -> str:
    return f'{app} — {title}' if title else app


def ranked_sessions(
    sessions: list[FocusSession], *, include_title: bool
) -> list[dict[str, str | float]]:
    totals: defaultdict[tuple[str, str], float] = defaultdict(float)
    for session in sessions:
        key = (session.app, session.title if include_title else '')
        totals[key] += session.duration.total_seconds()

    ranked = sorted(totals.items(), key=lambda item: item[1], reverse=True)[:10]
    return [
        {'label': session_label(app, title), 'duration_seconds': duration}
        for (app, title), duration in ranked
    ]


def ranked_visits(
    sessions: list[FocusSession], *, include_title: bool
) -> list[dict[str, str | int]]:
    visits: defaultdict[tuple[str, str], int] = defaultdict(int)
    for session in sessions:
        key = (session.app, session.title if include_title else '')
        visits[key] += 1

    ranked = sorted(visits.items(), key=lambda item: item[1], reverse=True)[:10]
    return [
        {'label': session_label(app, title), 'visit_count': visit_count}
        for (app, title), visit_count in ranked
    ]


def dashboard_payload(
    store: SQLiteEventStore,
    *,
    now: datetime | None = None,
    idle_after: timedelta | None = None,
) -> dict[str, Any]:
    records = store.read_events()
    sessions = focus_sessions(
        records,
        now=now,
        idle_after=idle_after or load_settings().idle_after,
    )
    active_seconds = sum((session.duration.total_seconds() for session in sessions), 0.0)
    idle_seconds = sum((session.idle_duration.total_seconds() for session in sessions), 0.0)
    context_switch_count = sum(
        1
        for current, following in pairwise(sessions)
        if (current.app, current.title) != (following.app, following.title)
    )

    return {
        'theme': omarchy_theme_payload(),
        'kpis': {
            'active_seconds': active_seconds,
            'idle_seconds': idle_seconds,
            'average_window_seconds': active_seconds / len(sessions) if sessions else 0.0,
            'context_switch_count': context_switch_count,
        },
        'top_sessions': {
            'app': ranked_sessions(sessions, include_title=False),
            'app_title': ranked_sessions(sessions, include_title=True),
        },
        'top_visits': {
            'app': ranked_visits(sessions, include_title=False),
            'app_title': ranked_visits(sessions, include_title=True),
        },
        'category_totals': [
            {
                'id': total.category.id,
                'name': total.category.name,
                'duration_seconds': total.duration.total_seconds(),
            }
            for total in store.category_active_time_totals(sessions)
        ],
        'categories': [
            {'id': category.id, 'name': category.name}
            for category in store.list_categories()
        ],
        'category_rules': [
            {
                'id': rule.id,
                'app': rule.app,
                'title_substring': rule.title_substring,
                'categories': [
                    {'id': category.id, 'name': category.name}
                    for category in rule.categories
                ],
            }
            for rule in store.list_category_rules()
        ],
        'known_apps': store.list_known_apps(),
        'events': [
            {
                'id': record.id,
                'recorded_at': record.recorded_at.isoformat(),
                'event': record.event,
                'data': record.data,
            }
            for record in records[:50]
        ],
    }


class DashboardHandler(BaseHTTPRequestHandler):
    server_version = 'ActivityTrackerDashboard/1.0'

    def do_GET(self) -> None:
        path = urlparse(self.path).path
        server = cast(DashboardServer, self.server)
        if path == '/api/dashboard':
            self._send_json()
        elif path == '/api/bar-stats':
            self._send_json_payload(bar_stats_payload())
        elif path == '/api/theme':
            self._send_json_payload(omarchy_theme_payload())
        elif path == '/events':
            self._stream_events()
        elif server.serve_frontend and path == '/':
            self._send_frontend_index()
        elif server.serve_frontend and not self._send_asset(path):
            self.send_error(HTTPStatus.NOT_FOUND)
        else:
            self.send_error(HTTPStatus.NOT_FOUND)

    def do_POST(self) -> None:
        path = urlparse(self.path).path
        try:
            payload = self._read_json()
            with SQLiteEventStore() as store:
                if path == '/api/categories':
                    store.create_category(str(payload['name']))
                elif path == '/api/category-rules':
                    store.assign_categories_to_rule(
                        str(payload['app']),
                        [int(category_id) for category_id in payload['category_ids']],
                        title_substring=(
                            str(payload['title_substring'])
                            if payload.get('title_substring')
                            else None
                        ),
                    )
                else:
                    self.send_error(HTTPStatus.NOT_FOUND)
                    return
                response = dashboard_payload(store)
        except (KeyError, TypeError, ValueError, json.JSONDecodeError) as error:
            self.send_error(HTTPStatus.BAD_REQUEST, str(error))
            return
        self._send_json_payload(response)

    def do_PUT(self) -> None:
        path = urlparse(self.path).path
        prefix = '/api/category-rules/'
        if not path.startswith(prefix):
            self.send_error(HTTPStatus.NOT_FOUND)
            return
        try:
            rule_id = int(path.removeprefix(prefix))
            payload = self._read_json()
            with SQLiteEventStore() as store:
                store.update_category_rule(
                    rule_id,
                    str(payload['app']),
                    [int(category_id) for category_id in payload['category_ids']],
                    title_substring=(
                        str(payload['title_substring'])
                        if payload.get('title_substring')
                        else None
                    ),
                )
                response = dashboard_payload(store)
        except KeyError:
            self.send_error(HTTPStatus.NOT_FOUND, 'category rule not found')
            return
        except (TypeError, ValueError, json.JSONDecodeError) as error:
            self.send_error(HTTPStatus.BAD_REQUEST, str(error))
            return
        self._send_json_payload(response)

    def do_DELETE(self) -> None:
        path = urlparse(self.path).path
        prefix = '/api/category-rules/'
        if not path.startswith(prefix):
            self.send_error(HTTPStatus.NOT_FOUND)
            return
        try:
            rule_id = int(path.removeprefix(prefix))
        except ValueError:
            self.send_error(HTTPStatus.BAD_REQUEST, 'invalid category rule ID')
            return
        with SQLiteEventStore() as store:
            if not store.delete_category_rule(rule_id):
                self.send_error(HTTPStatus.NOT_FOUND)
                return
            response = dashboard_payload(store)
        self._send_json_payload(response)

    def _read_json(self) -> dict[str, Any]:
        length = int(self.headers.get('Content-Length', '0'))
        if length < 1:
            raise ValueError('JSON request body is required')
        return json.loads(self.rfile.read(length))

    def _snapshot(self) -> dict[str, Any]:
        with SQLiteEventStore() as store:
            return dashboard_payload(store)

    def _send_frontend_index(self) -> None:
        index = FRONTEND_DIST / 'index.html'
        if not index.is_file():
            self.send_error(HTTPStatus.NOT_FOUND, 'frontend production build not found')
            return
        self._send_file(index, 'text/html; charset=utf-8')

    def _send_asset(self, path: str) -> bool:
        requested = (FRONTEND_DIST / path.lstrip('/')).resolve()
        if FRONTEND_DIST not in requested.parents or not requested.is_file():
            return False
        content_type = mimetypes.guess_type(requested.name)[0] or 'application/octet-stream'
        self._send_file(requested, content_type)
        return True

    def _send_file(self, file_path: Path, content_type: str) -> None:
        self._write_body(file_path.read_bytes(), content_type)

    def _write_body(self, body: bytes, content_type: str) -> None:
        try:
            self.send_response(HTTPStatus.OK)
            self.send_header('Content-Type', content_type)
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def _send_json(self) -> None:
        self._send_json_payload(self._snapshot())

    def _send_json_payload(self, payload: dict[str, Any]) -> None:
        self._write_body(json.dumps(payload).encode(), 'application/json; charset=utf-8')

    def _stream_events(self) -> None:
        self.send_response(HTTPStatus.OK)
        self.send_header('Content-Type', 'text/event-stream; charset=utf-8')
        self.send_header('Cache-Control', 'no-cache')
        self.send_header('Connection', 'keep-alive')
        self.end_headers()

        try:
            while True:
                snapshot = json.dumps(self._snapshot())
                self.wfile.write(f'event: snapshot\ndata: {snapshot}\n\n'.encode())
                self.wfile.flush()
                time.sleep(1)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def log_message(self, format: str, *args: object) -> None:
        return


class DashboardServer(ThreadingHTTPServer):
    daemon_threads = True

    def __init__(
        self,
        server_address: tuple[str, int],
        request_handler_class: type[DashboardHandler],
        *,
        serve_frontend: bool = False,
    ) -> None:
        super().__init__(server_address, request_handler_class)
        self.serve_frontend = serve_frontend


def collect_events() -> None:
    try:
        with SQLiteEventStore() as store:
            listen(store)
    except (KeyError, OSError) as error:
        debug(f'Event collector stopped: {error}')


def main() -> None:
    parser = argparse.ArgumentParser(description='Serve the activity-tracker dashboard.')
    settings = load_settings()
    parser.add_argument('--host', help='bind address (defaults to dashboard.host)')
    parser.add_argument('--port', type=int, help='TCP port (defaults to dashboard.port)')
    parser.add_argument(
        '--collector',
        action='store_true',
        help='also run an in-process collector (development only; use activity-tracker-service normally)',
    )
    parser.add_argument(
        '--no-collector',
        action='store_true',
        help=argparse.SUPPRESS,
    )
    parser.add_argument(
        '--production',
        action='store_true',
        help='serve the React production build bundled with the installed package',
    )
    args = parser.parse_args()

    if args.collector and not args.no_collector:
        threading.Thread(target=collect_events, daemon=True).start()

    host = args.host or settings.dashboard_host
    port = args.port or settings.dashboard_port
    server = DashboardServer(
        (host, port),
        DashboardHandler,
        serve_frontend=args.production,
    )
    debug(
        f'Dashboard API available at http://{host}:{port}'
        + (' (serving production frontend)' if args.production else '')
    )
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        debug('Dashboard stopped.')
    finally:
        server.server_close()


def dashboard_executable() -> str | None:
    """Find the dashboard entry point installed alongside this interpreter."""
    sibling = Path(sys.executable).with_name('activity-tracker-dashboard')
    if sibling.is_file():
        return str(sibling)
    return shutil.which('activity-tracker-dashboard')


def open_dashboard() -> None:
    """Start the local dashboard when needed, then open it in the browser."""
    import urllib.error
    import urllib.request

    dashboard_url = 'http://127.0.0.1:8765'
    try:
        with urllib.request.urlopen(f'{dashboard_url}/api/dashboard', timeout=1):
            pass
    except (OSError, urllib.error.URLError):
        dashboard_command = dashboard_executable()
        if dashboard_command is None:
            raise RuntimeError('activity-tracker-dashboard is not installed or available on PATH')
        subprocess.Popen(
            [dashboard_command, '--production'],
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            start_new_session=True,
        )
        for _ in range(10):
            try:
                with urllib.request.urlopen(f'{dashboard_url}/api/dashboard', timeout=1):
                    break
            except (OSError, urllib.error.URLError):
                time.sleep(0.2)
        else:
            raise RuntimeError('dashboard did not start on http://127.0.0.1:8765')

    browser_command = shutil.which('xdg-open')
    if browser_command is None:
        raise RuntimeError('xdg-open is not available on PATH')
    subprocess.run([browser_command, dashboard_url], check=True)


def open_dashboard_main() -> None:
    """CLI wrapper for opening the installed local dashboard."""
    parser = argparse.ArgumentParser(description='Open the local Activity Tracker dashboard.')
    parser.parse_args()
    open_dashboard()


if __name__ == '__main__':
    main()
