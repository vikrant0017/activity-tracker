import json
from collections import defaultdict
from datetime import timedelta

from activity_tracker.database import SQLiteEventStore
from activity_tracker.stats import focus_sessions, format_duration


def bar_stats_payload() -> dict[str, object]:
    with SQLiteEventStore() as store:
        sessions = focus_sessions(store.read_events())

    active_seconds = sum(session.duration.total_seconds() for session in sessions)
    app_totals = defaultdict(float)
    for session in sessions:
        app_totals[session.app] += session.duration.total_seconds()

    top_apps = sorted(app_totals.items(), key=lambda item: item[1], reverse=True)[:3]
    return {
        'active_time': format_duration_seconds(active_seconds),
        'top_apps': [
            {'app': app, 'duration': format_duration_seconds(duration)}
            for app, duration in top_apps
        ],
    }


def main() -> None:
    print(json.dumps(bar_stats_payload()))


def format_duration_seconds(seconds: float) -> str:
    return format_duration(timedelta(seconds=seconds)).rsplit(':', 1)[0]


if __name__ == '__main__':
    main()
