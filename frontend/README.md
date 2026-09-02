# Activity Tracker dashboard

The React/Vite dashboard for the Activity Tracker Python application.

## Development

Start the local Python API from the repository root, then start Vite:

```sh
uv run activity-tracker-dashboard
cd frontend
npm ci
npm run dev
```

Vite proxies `/api` and `/events` to `http://127.0.0.1:8765`.

## Production assets

Do not commit `dist/`. Build and copy the dashboard assets into the Python package with:

```sh
python scripts/build_frontend.py
```

Run this command from the repository root. The release wrapper `scripts/build_wheel.sh` performs this build before it creates a Python wheel.
