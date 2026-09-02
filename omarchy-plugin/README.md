# Omarchy Activity Tracker widget

The bar widget displays total active time (with the tracker's simple idle time excluded) and the top three applications by active duration. It refreshes every 10 seconds from the local dashboard daemon at `http://127.0.0.1:8765`.

- **Automatic activation:** when `activity-tracker-dashboard` is running, the widget picks up live data on its next refresh.
- **Daemon offline:** the widget displays `XX:XX` rather than an error state.
- **Click:** start the local dashboard if it is not already running, then open it in the default browser.
- **Middle-click:** refresh the displayed stats immediately.

The plugin is installed to `~/.config/omarchy/plugins/vikrant.activity-tracker/` and should be added to the desired `bar.layout` section in `~/.config/omarchy/shell.json`.
