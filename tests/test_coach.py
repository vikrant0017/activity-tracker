from datetime import UTC, datetime, timedelta
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest import TestCase
from unittest.mock import patch

from activity_tracker import coach
from activity_tracker.coach import apply_action, snapshot
from activity_tracker.config import Settings
from activity_tracker.database import ACTIVE_WINDOW_EVENT, SQLiteEventStore


class BreakCoachTests(TestCase):
    def setUp(self) -> None:
        self.settings = Settings(break_coach_enabled=True)

    def test_newly_enabled_coach_starts_counting_from_enablement(self) -> None:
        now = datetime(2026, 9, 13, 12, tzinfo=UTC)
        with TemporaryDirectory() as directory:
            with SQLiteEventStore(Path(directory) / 'events.db') as store:
                status = snapshot(store, self.settings, now=now)
        self.assertEqual(status['active_seconds'], 0.0)
        self.assertFalse(status['due'])

    def test_due_after_configured_active_time_excluding_idle(self) -> None:
        start = datetime(2026, 9, 13, 9, tzinfo=UTC)
        with TemporaryDirectory() as directory:
            with SQLiteEventStore(Path(directory) / 'events.db') as store:
                snapshot(store, self.settings, now=start)
                store.connection.execute(
                    'INSERT INTO events (recorded_at, event, data, app, title) VALUES (?, ?, ?, ?, ?)',
                    (start.isoformat(), ACTIVE_WINDOW_EVENT, 'editor,Work', 'editor', 'Work'),
                )
                store.start_idle_period(start + timedelta(minutes=20))
                store.end_idle_period(start + timedelta(minutes=22))
                status = snapshot(store, self.settings, now=start + timedelta(hours=1))
        self.assertEqual(status['active_seconds'], 3480.0)
        self.assertTrue(status['due'])

    def test_confirmed_long_idle_period_grants_break_credit(self) -> None:
        start = datetime(2026, 9, 13, 9, tzinfo=UTC)
        with TemporaryDirectory() as directory:
            with SQLiteEventStore(Path(directory) / 'events.db') as store:
                snapshot(store, self.settings, now=start)
                store.start_idle_period(start + timedelta(minutes=10))
                store.end_idle_period(start + timedelta(minutes=15))
                status = snapshot(store, self.settings, now=start + timedelta(minutes=16))
                state = store.break_coach_state()
        self.assertEqual(status['active_seconds'], 0.0)
        self.assertEqual(state.credited_at, start + timedelta(minutes=15))

    def test_snooze_and_done_clear_due_state(self) -> None:
        start = datetime(2026, 9, 13, 9, tzinfo=UTC)
        with TemporaryDirectory() as directory:
            with SQLiteEventStore(Path(directory) / 'events.db') as store:
                snapshot(store, self.settings, now=start)
                apply_action(store, 'snooze', self.settings, now=start + timedelta(minutes=50))
                snoozed = snapshot(store, self.settings, now=start + timedelta(minutes=51))
                apply_action(store, 'done', self.settings, now=start + timedelta(minutes=52))
                completed = snapshot(store, self.settings, now=start + timedelta(minutes=52))
        self.assertIsNotNone(snoozed['snoozed_until'])
        self.assertEqual(completed['active_seconds'], 0.0)
        self.assertIsNone(completed['snoozed_until'])

    def test_due_break_launches_guide_without_granting_credit(self) -> None:
        now = datetime(2026, 9, 13, 9, tzinfo=UTC)
        settings = Settings(
            break_coach_enabled=True,
            break_active_after=timedelta(seconds=1),
        )

        class StoreContext:
            def __init__(self, store: SQLiteEventStore) -> None:
                self.store = store

            def __enter__(self) -> SQLiteEventStore:
                return self.store

            def __exit__(self, *args: object) -> None:
                return None

        with TemporaryDirectory() as directory:
            with SQLiteEventStore(Path(directory) / 'events.db') as store:
                snapshot(store, settings, now=now - timedelta(seconds=2))
                store.connection.execute(
                    'INSERT INTO events (recorded_at, event, data, app, title) VALUES (?, ?, ?, ?, ?)',
                    ((now - timedelta(seconds=2)).isoformat(), ACTIVE_WINDOW_EVENT, 'editor,Work', 'editor', 'Work'),
                )
                with (
                    patch.object(coach, '_now', return_value=now),
                    patch.object(coach, 'load_settings', return_value=settings),
                    patch.object(coach, 'SQLiteEventStore', return_value=StoreContext(store)),
                    patch.object(coach.threading, 'Thread') as thread,
                ):
                    coach.tick()
                state = store.break_coach_state()

        self.assertTrue(state.notification_pending)
        self.assertNotEqual(state.credited_at, now)
        self.assertEqual(thread.call_count, 2)
        self.assertEqual(thread.call_args_list[0].kwargs['target'], coach._launch_break_guide)
