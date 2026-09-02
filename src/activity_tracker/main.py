import os
import socket

from activity_tracker.database import EventWriter, SQLiteEventStore
from activity_tracker.debug import debug

ACTIVE_WINDOW_EVENT = 'activewindow'


def process_event(writer: EventWriter, event: str, data: str) -> None:
    """Store one active-window event and extract its app class and title."""
    if event != ACTIVE_WINDOW_EVENT:
        return

    app, _, title = data.partition(',')
    debug(f'({app}) {title}')
    writer.write_event(event, data, app=app, title=title)


def handle(writer: EventWriter, line: str) -> None:
    event, separator, data = line.partition('>>')
    if not separator or event != ACTIVE_WINDOW_EVENT:
        return

    process_event(writer, event, data)


def listen(writer: EventWriter) -> None:
    """Read Hyprland socket2 events until the connection closes."""
    sock_path = os.path.join(
        os.environ['XDG_RUNTIME_DIR'],
        'hypr',
        os.environ['HYPRLAND_INSTANCE_SIGNATURE'],
        '.socket2.sock',
    )

    with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as sock:
        sock.connect(sock_path)
        with sock.makefile('r') as events:
            for line in events:
                handle(writer, line.rstrip('\n'))


def main() -> None:
    with SQLiteEventStore() as store:
        listen(store)


if __name__ == '__main__':
    main()
