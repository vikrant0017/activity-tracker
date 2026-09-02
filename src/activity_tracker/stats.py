import argparse
from collections import defaultdict
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from activity_tracker.config import load_settings
from activity_tracker.database import EventRecord, SQLiteEventStore

DEFAULT_IDLE_AFTER = timedelta(minutes=5)


@dataclass(frozen=True, slots=True)
class FocusSession:
    app: str
    title: str
    started_at: datetime
    ended_at: datetime
    duration: timedelta
    idle_duration: timedelta


def focus_sessions(
    records: Sequence[EventRecord],
    *,
    idle_after: timedelta = DEFAULT_IDLE_AFTER,
    now: datetime | None = None,
) -> list[FocusSession]:
    """Build app-window sessions from active-window focus events.

    A session ends at the next focus event, but its active duration is capped
    at `idle_after`. The rest of the gap is counted as simple idle time.
    """
    if idle_after <= timedelta():
        raise ValueError('idle_after must be greater than zero')

    focused = sorted(
        (record for record in records if record.event == 'activewindow'),
        key=lambda record: record.recorded_at,
    )
    if not focused:
        return []

    current_time = now or datetime.now(UTC)
    sessions = []
    for index, record in enumerate(focused):
        next_start = (
            focused[index + 1].recorded_at
            if index + 1 < len(focused)
            else current_time
        )
        if record.app is None:
            continue

        observed_end = max(record.recorded_at, next_start)
        active_end = min(observed_end, record.recorded_at + idle_after)
        duration = active_end - record.recorded_at
        idle_duration = observed_end - active_end
        sessions.append(
            FocusSession(
                app=record.app,
                title=record.title or '',
                started_at=record.recorded_at,
                ended_at=active_end,
                duration=duration,
                idle_duration=idle_duration,
            )
        )

    return sessions


def format_duration(duration: timedelta) -> str:
    total_seconds = int(duration.total_seconds())
    hours, remainder = divmod(total_seconds, 3_600)
    minutes, seconds = divmod(remainder, 60)
    return f'{hours:02}:{minutes:02}:{seconds:02}'


def print_stats(sessions: Sequence[FocusSession]) -> None:
    if not sessions:
        print('No active-window events have been recorded yet.')
        return

    print('Focus sessions')
    print('-' * 110)
    print(f"{'App':<20} {'Window':<32} {'Started':<25} {'Ended':<25} {'Active':>8}")
    for session in sessions:
        title = session.title[:31] + '…' if len(session.title) > 32 else session.title
        print(
            f'{session.app[:20]:<20} {title:<32} '
            f'{session.started_at.isoformat(timespec="seconds"):<25} '
            f'{session.ended_at.isoformat(timespec="seconds"):<25} '
            f'{format_duration(session.duration):>8}'
        )

    totals = defaultdict(timedelta)
    for session in sessions:
        totals[(session.app, session.title)] += session.duration

    print('\nTime by app-window')
    print('-' * 70)
    for (app, title), duration in sorted(totals.items(), key=lambda item: item[1], reverse=True):
        label = f'{app} — {title}' if title else app
        print(f'{format_duration(duration):>8}  {label}')

    idle_time = sum((session.idle_duration for session in sessions), timedelta())
    print(f'\nSimple idle time: {format_duration(idle_time)}')


def positive_seconds(value: str) -> float:
    seconds = float(value)
    if seconds <= 0:
        raise argparse.ArgumentTypeError('must be greater than zero')
    return seconds


def main() -> None:
    parser = argparse.ArgumentParser(
        description='Show activity statistics from the Hyprland event database.'
    )
    parser.add_argument(
        '--idle-after',
        type=positive_seconds,
        default=load_settings().idle_after.total_seconds(),
        metavar='SECONDS',
        help='count time after this unfocused-event gap as idle (defaults to activity.idle_after_seconds)',
    )
    args = parser.parse_args()

    with SQLiteEventStore() as store:
        sessions = focus_sessions(
            store.read_events(),
            idle_after=timedelta(seconds=args.idle_after),
        )
    print_stats(sessions)


if __name__ == '__main__':
    main()
