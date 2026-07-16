# Plugins

Optional external integrations for career-ops. Gmail, Notion, Apify, and more.

## Modules

### `cli.py`
Plugin CLI host. Subcommands: `list`, `available`, `add`, `enable`, `trust`, `run`, `skill`.

```
python -m scripts.python.plugins.cli list          # Installed plugins
python -m scripts.python.plugins.cli available     # Bundled + community plugins
python -m scripts.python.plugins.cli add <name>    # Install community plugin
python -m scripts.python.plugins.cli enable <id>   # Enable a plugin
python -m scripts.python.plugins.cli skill <id>    # Print plugin's how-to
```

### `engine.py`
Plugin runtime engine. Handles hook execution (`run_hook`), import (`import_hook`), diffing (`diff_plugin`), and lock-gate validation.

Key functions:
- `load_plugins()` — discover and load enabled plugins
- `run_hook(hook_name, **context)` — execute a hook across all plugins
- `diff_plugin(plugin_id)` — detect tampering
- `lock_gate(plugin_id)` — verify trust pin
- `redact_log(text, env)` — strip secrets from logs

### `install.py`
Plugin installation and scaffolding. Handles repo validation, manifest checking, and plugin scaffolding.

```
python -m scripts.python.plugins.install --validate <repo_url>
python -m scripts.python.plugins.install --scaffold my-plugin   # Create plugins.local/my-plugin/
```

### `validate_registry.py`
Validates the community plugin registry shape.

### `audit.py`
Static safety scan for community plugins. Detects dangerous patterns.

## Plugin Hooks

| Hook | Phase | Description |
|------|-------|-------------|
| `provider` | Scan | Custom job board provider |
| `ingest` | Input | Import data from external source (e.g. Gmail) |
| `export` | Output | Export data to external system (e.g. Notion) |
| `apply` | Apply | Pre-submit validation |

## Configuration

Plugins are configured in `config/plugins.example.yml`. Each plugin may require environment variables (API keys, tokens). Run `npm run doctor` to see which plugins are configured and what's missing.
