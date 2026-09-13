import sqlite3
from collections import defaultdict
from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Protocol, Self

from activity_tracker.paths import database_path as default_database_path

ACTIVE_WINDOW_EVENT = 'activewindow'
SCHEMA_VERSION = 3
PREDEFINED_CATEGORY_NAMES = (
    'browser',
    'code editor',
    'communication',
    'design',
    'development',
    'distraction',
    'documentation',
    'email',
    'entertainment',
    'file manager',
    'gaming',
    'learning',
    'media',
    'productivity',
    'social media',
    'terminal',
    'utilities',
)


@dataclass(frozen=True, slots=True)
class EventRecord:
    id: int
    recorded_at: datetime
    event: str
    data: str
    app: str | None
    title: str | None


@dataclass(frozen=True, slots=True)
class IdlePeriod:
    id: int
    started_at: datetime
    ended_at: datetime | None


@dataclass(frozen=True, slots=True)
class Category:
    id: int
    name: str


@dataclass(frozen=True, slots=True)
class CategoryRule:
    id: int
    app: str
    title_substring: str | None
    categories: tuple[Category, ...]


@dataclass(frozen=True, slots=True)
class CategoryTotal:
    category: Category
    duration: timedelta


class FocusSessionLike(Protocol):
    @property
    def app(self) -> str: ...

    @property
    def title(self) -> str: ...

    @property
    def duration(self) -> timedelta: ...


class EventReader(Protocol):
    def read_events(self, limit: int | None = None) -> Sequence[EventRecord]:
        """Return recorded active-window events from newest to oldest."""


class EventWriter(Protocol):
    def write_event(
        self,
        event: str,
        data: str,
        *,
        app: str | None = None,
        title: str | None = None,
    ) -> None:
        """Persist one active-window Hyprland event."""


def database_path() -> Path:
    """Return the configured XDG-compliant SQLite database location."""
    return default_database_path()


class SQLiteEventStore:
    """SQLite storage for active-window focus events and category rules."""

    def __init__(self, path: Path | None = None) -> None:
        self.path = path or database_path()
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.connection = sqlite3.connect(self.path, isolation_level=None, timeout=5)
        self.connection.execute('PRAGMA foreign_keys = ON')
        self.connection.execute('PRAGMA busy_timeout = 5000')
        self._create_schema()

    def __enter__(self) -> Self:
        return self

    def __exit__(self, *args: object) -> None:
        self.close()

    def close(self) -> None:
        self.connection.close()

    def _create_schema(self) -> None:
        """Apply ordered SQLite migrations and record the resulting schema version."""
        version = self.connection.execute('PRAGMA user_version').fetchone()[0]
        if version > SCHEMA_VERSION:
            raise RuntimeError(
                f'database schema version {version} is newer than supported version {SCHEMA_VERSION}'
            )
        with self.connection:
            if version < 1:
                self.connection.execute('''
                    CREATE TABLE IF NOT EXISTS events (
                        id INTEGER PRIMARY KEY,
                        recorded_at TEXT NOT NULL,
                        event TEXT NOT NULL,
                        data TEXT NOT NULL,
                        app TEXT,
                        title TEXT
                    )
                ''')
                self.connection.execute('CREATE INDEX IF NOT EXISTS events_recorded_at_idx ON events(recorded_at)')
            if version < 2:
                # Pre-release collectors recorded every Hyprland socket event.
                # Keep only the focus data this application can interpret.
                self.connection.execute('DELETE FROM events WHERE event <> ?', (ACTIVE_WINDOW_EVENT,))
                self.connection.execute('''
                    CREATE TABLE IF NOT EXISTS categories (
                        id INTEGER PRIMARY KEY,
                        name TEXT NOT NULL COLLATE NOCASE UNIQUE
                    )
                ''')
                self.connection.executemany(
                    'INSERT OR IGNORE INTO categories (name) VALUES (?)',
                    ((name,) for name in PREDEFINED_CATEGORY_NAMES),
                )
                self.connection.execute('''
                    CREATE TABLE IF NOT EXISTS category_rules (
                        id INTEGER PRIMARY KEY,
                        app TEXT NOT NULL,
                        title_substring TEXT NOT NULL DEFAULT '',
                        UNIQUE(app, title_substring)
                    )
                ''')
                self.connection.execute('''
                    CREATE TABLE IF NOT EXISTS category_rule_categories (
                        rule_id INTEGER NOT NULL REFERENCES category_rules(id) ON DELETE CASCADE,
                        category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
                        PRIMARY KEY (rule_id, category_id)
                    )
                ''')
                self.connection.execute('CREATE INDEX IF NOT EXISTS category_rules_app_idx ON category_rules(app)')
            if version < 3:
                self.connection.execute('''
                    CREATE TABLE IF NOT EXISTS idle_periods (
                        id INTEGER PRIMARY KEY,
                        started_at TEXT NOT NULL,
                        ended_at TEXT,
                        CHECK (ended_at IS NULL OR ended_at >= started_at)
                    )
                ''')
                self.connection.execute(
                    'CREATE INDEX IF NOT EXISTS idle_periods_started_at_idx ON idle_periods(started_at)'
                )
            self.connection.execute(f'PRAGMA user_version = {SCHEMA_VERSION}')

    def write_event(
        self,
        event: str,
        data: str,
        *,
        app: str | None = None,
        title: str | None = None,
    ) -> None:
        if event != ACTIVE_WINDOW_EVENT:
            raise ValueError('only activewindow events may be persisted')
        self.connection.execute(
            '''
            INSERT INTO events (recorded_at, event, data, app, title)
            VALUES (?, ?, ?, ?, ?)
            ''',
            (datetime.now(UTC).isoformat(), event, data, app, title),
        )

    def read_events(self, limit: int | None = None) -> Sequence[EventRecord]:
        if limit is not None and limit < 1:
            raise ValueError('limit must be greater than zero')

        query = '''
            SELECT id, recorded_at, event, data, app, title
            FROM events
            WHERE event = ?
            ORDER BY recorded_at DESC, id DESC
        '''
        parameters: tuple[object, ...] = (ACTIVE_WINDOW_EVENT,)
        if limit is not None:
            query += ' LIMIT ?'
            parameters += (limit,)

        rows = self.connection.execute(query, parameters).fetchall()
        return [
            EventRecord(
                id=row[0],
                recorded_at=datetime.fromisoformat(row[1]),
                event=row[2],
                data=row[3],
                app=row[4],
                title=row[5],
            )
            for row in rows
        ]

    def start_idle_period(self, started_at: datetime | None = None) -> IdlePeriod:
        """Start a Hypridle-confirmed period, ignoring duplicate callbacks."""
        open_period = self.connection.execute('''
            SELECT id, started_at, ended_at
            FROM idle_periods
            WHERE ended_at IS NULL
            ORDER BY started_at DESC, id DESC
            LIMIT 1
        ''').fetchone()
        if open_period is not None:
            return IdlePeriod(
                id=open_period[0],
                started_at=datetime.fromisoformat(open_period[1]),
                ended_at=None,
            )

        timestamp = (started_at or datetime.now(UTC)).isoformat()
        cursor = self.connection.execute(
            'INSERT INTO idle_periods (started_at) VALUES (?)', (timestamp,)
        )
        assert cursor.lastrowid is not None
        return IdlePeriod(id=cursor.lastrowid, started_at=datetime.fromisoformat(timestamp), ended_at=None)

    def end_idle_period(self, ended_at: datetime | None = None) -> bool:
        """Close the current Hypridle-confirmed period, if one exists."""
        open_period = self.connection.execute('''
            SELECT id, started_at
            FROM idle_periods
            WHERE ended_at IS NULL
            ORDER BY started_at DESC, id DESC
            LIMIT 1
        ''').fetchone()
        if open_period is None:
            return False

        timestamp = ended_at or datetime.now(UTC)
        started_at = datetime.fromisoformat(open_period[1])
        if timestamp < started_at:
            raise ValueError('idle period cannot end before it starts')
        self.connection.execute(
            'UPDATE idle_periods SET ended_at = ? WHERE id = ?',
            (timestamp.isoformat(), open_period[0]),
        )
        return True

    def read_idle_periods(self) -> Sequence[IdlePeriod]:
        """Return Hypridle-confirmed idle periods from oldest to newest."""
        rows = self.connection.execute('''
            SELECT id, started_at, ended_at
            FROM idle_periods
            ORDER BY started_at, id
        ''').fetchall()
        return [
            IdlePeriod(
                id=row[0],
                started_at=datetime.fromisoformat(row[1]),
                ended_at=datetime.fromisoformat(row[2]) if row[2] is not None else None,
            )
            for row in rows
        ]

    def list_known_apps(self) -> list[str]:
        """Return observed application classes alphabetically."""
        rows = self.connection.execute('''
            SELECT DISTINCT app
            FROM events
            WHERE event = ? AND app IS NOT NULL AND app <> ''
            ORDER BY app COLLATE NOCASE, app
        ''', (ACTIVE_WINDOW_EVENT,)).fetchall()
        return [row[0] for row in rows]

    def list_known_titles(self, app: str | None = None) -> list[str]:
        """Return observed window titles, optionally limited to one app class."""
        query = '''
            SELECT DISTINCT title
            FROM events
            WHERE event = ? AND title IS NOT NULL AND title <> ''
        '''
        parameters: tuple[object, ...] = (ACTIVE_WINDOW_EVENT,)
        if app is not None:
            query += ' AND app = ?'
            parameters += (app,)
        query += ' ORDER BY title COLLATE NOCASE, title'
        return [row[0] for row in self.connection.execute(query, parameters).fetchall()]

    def create_category(self, name: str) -> Category:
        name = name.strip()
        if not name:
            raise ValueError('category name must not be empty')
        try:
            cursor = self.connection.execute('INSERT INTO categories (name) VALUES (?)', (name,))
        except sqlite3.IntegrityError as error:
            raise ValueError(f'category already exists: {name}') from error
        if cursor.lastrowid is None:
            raise RuntimeError('SQLite did not return the new category ID')
        return Category(id=cursor.lastrowid, name=name)

    def list_categories(self) -> list[Category]:
        return [
            Category(id=row[0], name=row[1])
            for row in self.connection.execute(
                'SELECT id, name FROM categories ORDER BY name COLLATE NOCASE, id'
            ).fetchall()
        ]

    def delete_category(self, category_id: int) -> bool:
        """Remove a category and its mappings; discard rules left unmapped."""
        with self.connection:
            cursor = self.connection.execute('DELETE FROM categories WHERE id = ?', (category_id,))
            self._delete_unmapped_rules()
        return cursor.rowcount > 0

    def assign_categories_to_rule(
        self,
        app: str,
        category_ids: Iterable[int],
        *,
        title_substring: str | None = None,
    ) -> CategoryRule:
        """Create or update a rule, assigning every supplied category to it.

        A missing title substring makes an app-wide rule. Title-specific rules
        use case-insensitive substring matching when activity is categorized.
        """
        app = app.strip()
        if not app:
            raise ValueError('app must not be empty')
        if title_substring is not None:
            title_substring = title_substring.strip() or None
        category_ids = tuple(dict.fromkeys(category_ids))
        if not category_ids:
            raise ValueError('at least one category is required')

        with self.connection:
            self._require_categories(category_ids)
            self.connection.execute(
                'INSERT OR IGNORE INTO category_rules (app, title_substring) VALUES (?, ?)',
                (app, title_substring or ''),
            )
            row = self.connection.execute(
                'SELECT id FROM category_rules WHERE app = ? AND title_substring = ?',
                (app, title_substring or ''),
            ).fetchone()
            assert row is not None
            rule_id = row[0]
            self.connection.executemany(
                'INSERT OR IGNORE INTO category_rule_categories (rule_id, category_id) VALUES (?, ?)',
                ((rule_id, category_id) for category_id in category_ids),
            )
        return self.get_category_rule(rule_id)

    def update_category_rule(
        self,
        rule_id: int,
        app: str,
        category_ids: Iterable[int],
        *,
        title_substring: str | None = None,
    ) -> CategoryRule:
        """Replace a rule's match criteria and category assignments."""
        app = app.strip()
        if not app:
            raise ValueError('app must not be empty')
        if title_substring is not None:
            title_substring = title_substring.strip() or None
        category_ids = tuple(dict.fromkeys(category_ids))
        if not category_ids:
            raise ValueError('at least one category is required')

        with self.connection:
            self.get_category_rule(rule_id)
            self._require_categories(category_ids)
            duplicate = self.connection.execute(
                'SELECT id FROM category_rules WHERE app = ? AND title_substring = ? AND id != ?',
                (app, title_substring or '', rule_id),
            ).fetchone()
            if duplicate:
                raise ValueError('a matching category rule already exists')
            self.connection.execute(
                'UPDATE category_rules SET app = ?, title_substring = ? WHERE id = ?',
                (app, title_substring or '', rule_id),
            )
            self.connection.execute(
                'DELETE FROM category_rule_categories WHERE rule_id = ?', (rule_id,)
            )
            self.connection.executemany(
                'INSERT INTO category_rule_categories (rule_id, category_id) VALUES (?, ?)',
                ((rule_id, category_id) for category_id in category_ids),
            )
        return self.get_category_rule(rule_id)

    def get_category_rule(self, rule_id: int) -> CategoryRule:
        rules = self._rules('WHERE rules.id = ?', (rule_id,))
        if not rules:
            raise KeyError(f'unknown category rule: {rule_id}')
        return rules[0]

    def list_category_rules(self) -> list[CategoryRule]:
        return self._rules('', ())

    def remove_categories_from_rule(self, rule_id: int, category_ids: Iterable[int]) -> bool:
        """Remove category mappings and delete the rule if none remain."""
        category_ids = tuple(dict.fromkeys(category_ids))
        if not category_ids:
            return False
        placeholders = ', '.join('?' for _ in category_ids)
        with self.connection:
            cursor = self.connection.execute(
                f'DELETE FROM category_rule_categories '
                f'WHERE rule_id = ? AND category_id IN ({placeholders})',
                (rule_id, *category_ids),
            )
            self._delete_unmapped_rules()
        return cursor.rowcount > 0

    def delete_category_rule(self, rule_id: int) -> bool:
        return self.connection.execute('DELETE FROM category_rules WHERE id = ?', (rule_id,)).rowcount > 0

    def matching_category_rules(self, app: str, title: str = '') -> list[CategoryRule]:
        """Return rules matching an app class and optional title substring."""
        rules = self._rules('WHERE rules.app = ?', (app,))
        normalized_title = title.casefold()
        return [
            rule for rule in rules
            if rule.title_substring is None or rule.title_substring.casefold() in normalized_title
        ]

    def categories_for(self, app: str, title: str = '') -> list[Category]:
        """Return each matching category once, even if several rules match it."""
        categories = {
            category.id: category
            for rule in self.matching_category_rules(app, title)
            for category in rule.categories
        }
        return sorted(categories.values(), key=lambda category: (category.name.casefold(), category.id))

    def category_active_time_totals(
        self, sessions: Iterable[FocusSessionLike]
    ) -> list[CategoryTotal]:
        """Sum each focus session into every category matched by its rule(s)."""
        totals: defaultdict[int, timedelta] = defaultdict(timedelta)
        categories: dict[int, Category] = {}
        for session in sessions:
            for category in self.categories_for(session.app, session.title):
                categories[category.id] = category
                totals[category.id] += session.duration
        return [
            CategoryTotal(category=category, duration=totals[category_id])
            for category_id, category in sorted(
                categories.items(), key=lambda item: (-totals[item[0]].total_seconds(), item[1].name.casefold())
            )
        ]

    def _require_categories(self, category_ids: Sequence[int]) -> None:
        placeholders = ', '.join('?' for _ in category_ids)
        count = self.connection.execute(
            f'SELECT COUNT(*) FROM categories WHERE id IN ({placeholders})', category_ids
        ).fetchone()[0]
        if count != len(category_ids):
            raise KeyError('one or more category IDs do not exist')

    def _delete_unmapped_rules(self) -> None:
        self.connection.execute('''
            DELETE FROM category_rules
            WHERE NOT EXISTS (
                SELECT 1
                FROM category_rule_categories
                WHERE category_rule_categories.rule_id = category_rules.id
            )
        ''')

    def _rules(self, where: str, parameters: tuple[object, ...]) -> list[CategoryRule]:
        rows = self.connection.execute(f'''
            SELECT rules.id, rules.app, rules.title_substring,
                   categories.id, categories.name
            FROM category_rules AS rules
            JOIN category_rule_categories AS mappings ON mappings.rule_id = rules.id
            JOIN categories ON categories.id = mappings.category_id
            {where}
            ORDER BY rules.app COLLATE NOCASE, rules.id, categories.name COLLATE NOCASE, categories.id
        ''', parameters).fetchall()
        grouped: dict[int, tuple[str, str | None, list[Category]]] = {}
        for rule_id, app, title_substring, category_id, category_name in rows:
            entry = grouped.setdefault(rule_id, (app, title_substring or None, []))
            entry[2].append(Category(id=category_id, name=category_name))
        return [
            CategoryRule(
                id=rule_id,
                app=app,
                title_substring=title_substring,
                categories=tuple(categories),
            )
            for rule_id, (app, title_substring, categories) in grouped.items()
        ]
