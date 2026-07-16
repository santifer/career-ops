# Export

Dashboard and data export utilities.

## Modules

### `build_dashboard.py`
Builds the Go TUI dashboard from application data.

```
python -m scripts.python.export.build_dashboard
npm run build:dashboard
```

The dashboard itself is a Go application in `dashboard/`, served via:
```
npm run serve:dashboard
```

## CLI Bridge

```bash
python -m scripts.python.export build-dashboard
```
