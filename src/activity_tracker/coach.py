"""Gentle, local break-coach service and state transitions."""

import argparse
import shutil
import subprocess
import threading
import time
from datetime import UTC, datetime, timedelta

from activity_tracker.config import Settings, load_settings, write_settings
from activity_tracker.database import BreakCoachState, SQLiteEventStore
from activity_tracker.debug import debug
from activity_tracker.stats import focus_sessions

POLL_SECONDS = 30


def _now() -> datetime:
    return datetime.now(UTC)


def active_seconds_since(store: SQLiteEventStore, since: datetime, *, now: datetime) -> float:
    """Return confirmed active-window time after a coach credit."""
    return sum(
        (
            max(timedelta(), session.ended_at - max(session.started_at, since)).total_seconds()
            for session in focus_sessions(
                store.read_events(), idle_periods=store.read_idle_periods(), now=now
            )
        ),
        0.0,
    )


def _credit(store: SQLiteEventStore, at: datetime, kind: str) -> BreakCoachState:
    state = BreakCoachState(at, None, False)
    store.save_break_coach_state(state)
    store.record_coach_intervention(kind, recorded_at=at)
    return state


def _apply_automatic_idle_credit(
    store: SQLiteEventStore, state: BreakCoachState, settings: Settings, *, now: datetime
) -> BreakCoachState:
    for period in reversed(store.read_idle_periods()):
        if period.ended_at is None or period.ended_at > now:
            continue
        if state.credited_at is not None and period.ended_at <= state.credited_at:
            break
        if period.ended_at - period.started_at >= settings.break_duration:
            return _credit(store, period.ended_at, 'automatic_idle_credit')
    return state


def snapshot(store: SQLiteEventStore, settings: Settings, *, now: datetime | None = None) -> dict[str, object]:
    """Return dashboard-safe coach status and initialize a newly enabled coach."""
    current = now or _now()
    state = store.break_coach_state()
    if settings.break_coach_enabled and state.credited_at is None:
        state = _credit(store, current, 'enabled')
    if settings.break_coach_enabled:
        state = _apply_automatic_idle_credit(store, state, settings, now=current)
    if state.snoozed_until is not None and state.snoozed_until <= current:
        state = BreakCoachState(state.credited_at, None, False)
        store.save_break_coach_state(state)

    active_seconds = (
        active_seconds_since(store, state.credited_at, now=current)
        if settings.break_coach_enabled and state.credited_at is not None
        else 0.0
    )
    due = (
        settings.break_coach_enabled
        and state.snoozed_until is None
        and active_seconds >= settings.break_active_after.total_seconds()
    )
    return {
        'enabled': settings.break_coach_enabled,
        'active_seconds': active_seconds,
        'active_after_seconds': settings.break_active_after.total_seconds(),
        'break_seconds': settings.break_duration.total_seconds(),
        'snooze_seconds': settings.break_snooze.total_seconds(),
        'due': due,
        'snoozed_until': state.snoozed_until.isoformat() if state.snoozed_until else None,
        'notification_pending': state.notification_pending,
    }


def apply_action(store: SQLiteEventStore, action: str, settings: Settings, *, now: datetime | None = None) -> Settings:
    current = now or _now()
    if action == 'done':
        _credit(store, current, 'completed')
    elif action == 'snooze':
        state = store.break_coach_state()
        store.save_break_coach_state(BreakCoachState(
            state.credited_at, current + settings.break_snooze, False
        ))
        store.record_coach_intervention('snoozed', recorded_at=current)
    elif action == 'disable':
        settings = Settings(
            idle_after=settings.idle_after,
            dashboard_host=settings.dashboard_host,
            dashboard_port=settings.dashboard_port,
            break_coach_enabled=False,
            break_active_after=settings.break_active_after,
            break_duration=settings.break_duration,
            break_snooze=settings.break_snooze,
        )
        write_settings(settings)
        state = store.break_coach_state()
        store.save_break_coach_state(BreakCoachState(state.credited_at, state.snoozed_until, False))
        store.record_coach_intervention('disabled', recorded_at=current)
    else:
        raise ValueError('action must be done, snooze, or disable')
    return settings


def _deliver_notification(settings: Settings) -> None:
    command = shutil.which('notify-send')
    if command is None:
        with SQLiteEventStore() as store:
            state = store.break_coach_state()
            store.save_break_coach_state(BreakCoachState(state.credited_at, state.snoozed_until, False))
            store.record_coach_intervention('notification_unavailable')
        return
    try:
        active_minutes = int(settings.break_active_after.total_seconds() // 60)
        break_minutes = int(settings.break_duration.total_seconds() // 60)
        result = subprocess.run(
            [command, '--app-name=Activity Tracker', '--urgency=normal', '--action=done=Done',
             '--action=snooze=Snooze', '--action=disable=Disable',
             'Time for a break', f'You have been actively working for {active_minutes} minutes. Take {break_minutes} minutes to move and rest your eyes.'],
            check=False, capture_output=True, text=True, timeout=900,
        )
        action = result.stdout.strip()
        with SQLiteEventStore() as store:
            settings = load_settings()
            if action in {'done', 'snooze', 'disable'}:
                apply_action(store, action, settings)
            else:
                state = store.break_coach_state()
                store.save_break_coach_state(BreakCoachState(state.credited_at, state.snoozed_until, False))
                store.record_coach_intervention('notification_dismissed')
    except (OSError, subprocess.TimeoutExpired) as error:
        debug(f'Break notification failed: {error}')
        with SQLiteEventStore() as store:
            state = store.break_coach_state()
            store.save_break_coach_state(BreakCoachState(state.credited_at, state.snoozed_until, False))
            store.record_coach_intervention('notification_unavailable')


def _launch_break_guide() -> None:
    """Open the optional local guide without disrupting the reminder flow."""
    try:
        # Imported lazily because the dashboard module also exposes coach state.
        from activity_tracker.dashboard import open_break_guide

        open_break_guide()
    except (OSError, RuntimeError, subprocess.SubprocessError) as error:
        debug(f'Break guide launch failed: {error}')


def tick() -> None:
    settings = load_settings()
    if not settings.break_coach_enabled:
        return
    with SQLiteEventStore() as store:
        status = snapshot(store, settings)
        if not status['due'] or status['notification_pending']:
            return
        state = store.break_coach_state()
        store.save_break_coach_state(BreakCoachState(state.credited_at, state.snoozed_until, True))
        store.record_coach_intervention('shown')
    threading.Thread(target=_launch_break_guide, daemon=True).start()
    threading.Thread(target=_deliver_notification, args=(settings,), daemon=True).start()


def main() -> None:
    parser = argparse.ArgumentParser(description='Run Activity Tracker break-coach reminders.')
    parser.add_argument('--once', action='store_true', help='evaluate eligibility once and exit')
    args = parser.parse_args()
    while True:
        try:
            tick()
        except (OSError, ValueError) as error:
            debug(f'Break coach tick failed: {error}')
        if args.once:
            return
        time.sleep(POLL_SECONDS)


if __name__ == '__main__':
    main()
