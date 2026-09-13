from datetime import UTC, datetime, timedelta
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from activity_tracker.database import EventRecord, IdlePeriod, SQLiteEventStore
from activity_tracker.dashboard import dashboard_payload
from activity_tracker.hypridle import BLOCK_END, BLOCK_START, install_listener, uninstall_listener
from activity_tracker.stats import confirmed_idle_duration, focus_sessions


class IdlePeriodStoreTests(unittest.TestCase):
    def test_start_is_idempotent_and_resume_closes_the_open_period(self) -> None:
        with TemporaryDirectory() as directory:
            path = Path(directory) / 'events.db'
            started_at = datetime(2026, 1, 1, tzinfo=UTC)
            ended_at = started_at + timedelta(minutes=5)
            with SQLiteEventStore(path) as store:
                first = store.start_idle_period(started_at)
                duplicate = store.start_idle_period(started_at + timedelta(seconds=1))
                self.assertEqual(first.id, duplicate.id)
                self.assertTrue(store.end_idle_period(ended_at))
                self.assertFalse(store.end_idle_period(ended_at))
                self.assertEqual(store.read_idle_periods(), [IdlePeriod(first.id, started_at, ended_at)])


class FocusSessionTests(unittest.TestCase):
    def test_idle_period_splits_a_focused_window_without_counting_it_as_active(self) -> None:
        started_at = datetime(2026, 1, 1, tzinfo=UTC)
        records = [
            EventRecord(1, started_at, 'activewindow', 'firefox,Docs', 'firefox', 'Docs'),
            EventRecord(2, started_at + timedelta(minutes=10), 'activewindow', 'foot,Shell', 'foot', 'Shell'),
        ]
        periods = [IdlePeriod(1, started_at + timedelta(minutes=3), started_at + timedelta(minutes=7))]

        sessions = focus_sessions(records, idle_periods=periods, now=started_at + timedelta(minutes=10))

        self.assertEqual([session.duration for session in sessions], [timedelta(minutes=3), timedelta(minutes=3)])
        self.assertEqual([session.app for session in sessions], ['firefox', 'firefox'])
        self.assertEqual(confirmed_idle_duration(periods), timedelta(minutes=4))

    def test_open_idle_period_is_counted_through_now(self) -> None:
        started_at = datetime(2026, 1, 1, tzinfo=UTC)
        period = IdlePeriod(1, started_at + timedelta(minutes=2), None)

        self.assertEqual(
            confirmed_idle_duration([period], now=started_at + timedelta(minutes=5)), timedelta(minutes=3)
        )

    def test_dashboard_reports_confirmed_idle_and_excludes_it_from_active_time(self) -> None:
        with TemporaryDirectory() as directory:
            path = Path(directory) / 'events.db'
            started_at = datetime(2026, 1, 1, tzinfo=UTC)
            with SQLiteEventStore(path) as store:
                store.connection.execute(
                    '''INSERT INTO events (recorded_at, event, data, app, title)
                    VALUES (?, 'activewindow', 'firefox,Docs', 'firefox', 'Docs')''',
                    (started_at.isoformat(),),
                )
                store.start_idle_period(started_at + timedelta(minutes=3))
                store.end_idle_period(started_at + timedelta(minutes=7))
                payload = dashboard_payload(store, now=started_at + timedelta(minutes=10))

            self.assertEqual(payload['kpis']['active_seconds'], 360.0)
            self.assertEqual(payload['kpis']['idle_seconds'], 240.0)


class HypridleConfigTests(unittest.TestCase):
    def test_install_replaces_only_the_tracker_owned_block(self) -> None:
        with TemporaryDirectory() as directory:
            path = Path(directory) / 'hypridle.conf'
            original = 'listener {\n    timeout = 150\n    on-timeout = lock\n}\n'
            path.write_text(original)

            install_listener(path, 300, '/usr/bin/activity-tracker-hypridle')
            install_listener(path, 120, '/usr/bin/activity-tracker-hypridle')

            installed = path.read_text()
            self.assertIn(original.rstrip(), installed)
            self.assertEqual(installed.count(BLOCK_START), 1)
            self.assertIn('timeout = 120', installed)
            self.assertTrue(uninstall_listener(path))
            self.assertEqual(path.read_text(), original)
            self.assertNotIn(BLOCK_END, path.read_text())

    def test_install_rejects_an_incomplete_owned_block(self) -> None:
        with TemporaryDirectory() as directory:
            path = Path(directory) / 'hypridle.conf'
            path.write_text(f'{BLOCK_START}\nlistener {{\n')

            with self.assertRaisesRegex(ValueError, 'incomplete'):
                install_listener(path, 300, '/usr/bin/activity-tracker-hypridle')


if __name__ == '__main__':
    unittest.main()
