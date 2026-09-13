from collections import defaultdict
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from activity_tracker.database import EventRecord, IdlePeriod, SQLiteEventStore


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
    idle_periods: Sequence[IdlePeriod] = (),
    now: datetime | None = None,
) -> list[FocusSession]:
    """Build focused app-window sessions, excluding Hypridle idle intervals."""

    focused = sorted(
        (record for record in records if record.event == 'activewindow'),
        key=lambda record: record.recorded_at,
    )
    if not focused:
        return []

    current_time = now or datetime.now(UTC)
    periods = sorted(idle_periods, key=lambda period: period.started_at)
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
        cursor = record.recorded_at
        for period in periods:
            period_end = period.ended_at or current_time
            if period_end <= cursor:
                continue
            if period.started_at >= observed_end:
                break
            active_end = min(period.started_at, observed_end)
            if active_end > cursor:
                sessions.append(
                    FocusSession(
                        record.app,
                        record.title or '',
                        cursor,
                        active_end,
                        active_end - cursor,
                        timedelta(),
                    )
                )
            cursor = max(cursor, min(period_end, observed_end))
        if cursor < observed_end:
            sessions.append(
                FocusSession(
                    record.app,
                    record.title or '',
                    cursor,
                    observed_end,
                    observed_end - cursor,
                    timedelta(),
                )
            )

    return sessions


def confirmed_idle_duration(idle_periods: Sequence[IdlePeriod], *, now: datetime | None = None) -> timedelta:
    """Return total time covered by persisted Hypridle periods."""
    current_time = now or datetime.now(UTC)
    return sum(
        (max(timedelta(), (period.ended_at or current_time) - period.started_at) for period in idle_periods),
        timedelta(),
    )


def format_duration(duration: timedelta) -> str:
    total_seconds = int(duration.total_seconds())
    hours, remainder = divmod(total_seconds, 3_600)
    minutes, seconds = divmod(remainder, 60)
    return f'{hours:02}:{minutes:02}:{seconds:02}'


def print_stats(sessions: Sequence[FocusSession], *, idle_duration: timedelta = timedelta()) -> None:
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

    print(f'\nHypridle idle time: {format_duration(idle_duration)}')


def main() -> None:
    with SQLiteEventStore() as store:
        periods = store.read_idle_periods()
        sessions = focus_sessions(store.read_events(), idle_periods=periods)
    print_stats(sessions, idle_duration=confirmed_idle_duration(periods))


if __name__ == '__main__':
    main()
