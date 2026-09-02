import os

DEBUG_ENABLED = os.environ.get('ACTIVITY_TRACKER_DEBUG', '').lower() in {
    '1',
    'true',
    'yes',
}


def debug(message: str) -> None:
    if DEBUG_ENABLED:
        print(message)
