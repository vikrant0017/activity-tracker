from datetime import UTC, date, datetime, timedelta
import os
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest import TestCase
from unittest.mock import patch

from activity_tracker.dashboard import _dashboard_date, dashboard_payload, open_break_guide
from activity_tracker.database import ACTIVE_WINDOW_EVENT, SQLiteEventStore


class DashboardPayloadTests(TestCase):
    def test_break_guide_uses_development_url_without_starting_production_server(self) -> None:
        with (
            patch.dict(os.environ, {'ACTIVITY_TRACKER_GUIDE_URL': 'http://127.0.0.1:5173'}),
            patch('activity_tracker.dashboard._open_chromium_app') as open_app,
        ):
            open_break_guide()
        open_app.assert_called_once_with('http://127.0.0.1:5173/?break-guide=1')

    def test_selected_day_clips_sessions_and_idle_time_at_midnight(self) -> None:
        with TemporaryDirectory() as directory:
            with SQLiteEventStore(Path(directory) / 'events.db') as store:
                store.connection.executemany(
                    '''
                    INSERT INTO events (recorded_at, event, data, app, title)
                    VALUES (?, ?, ?, ?, ?)
                    ''',
                    (
                        ('2026-09-12T23:58:00+00:00', ACTIVE_WINDOW_EVENT, 'A', 'A', ''),
                        ('2026-09-13T00:03:00+00:00', ACTIVE_WINDOW_EVENT, 'B', 'B', ''),
                        ('2026-09-13T00:13:00+00:00', ACTIVE_WINDOW_EVENT, 'C', 'C', ''),
                    ),
                )
                store.start_idle_period(datetime(2026, 9, 13, 0, 8, tzinfo=UTC))
                store.end_idle_period(datetime(2026, 9, 13, 0, 13, tzinfo=UTC))
                payload = dashboard_payload(
                    store,
                    now=datetime(2026, 9, 13, 0, 20, tzinfo=UTC),
                    selected_date=date(2026, 9, 13),
                )

        self.assertEqual(payload['date'], '2026-09-13')
        self.assertEqual(payload['kpis']['active_seconds'], 900.0)
        self.assertEqual(payload['kpis']['idle_seconds'], 300.0)
        self.assertEqual(
            [segment['app'] for segment in payload['timeline']], ['A', 'B', 'C']
        )
        self.assertEqual(
            [segment['duration_seconds'] for segment in payload['timeline']],
            [180.0, 300.0, 420.0],
        )
        self.assertEqual(payload['hourly_activity'][0]['active_seconds'], 900.0)
        self.assertTrue(all(bucket['active_seconds'] == 0 for bucket in payload['hourly_activity'][1:]))
        self.assertEqual([event['data'] for event in payload['events']], ['C', 'B'])

    def test_dashboard_date_requires_iso_calendar_date(self) -> None:
        now = datetime(2026, 9, 13, 12, tzinfo=UTC)
        self.assertEqual(_dashboard_date(None, now=now), date(2026, 9, 13))
        self.assertEqual(_dashboard_date('2026-09-12', now=now), date(2026, 9, 12))
        with self.assertRaisesRegex(ValueError, 'YYYY-MM-DD'):
            _dashboard_date('12/09/2026', now=now)
