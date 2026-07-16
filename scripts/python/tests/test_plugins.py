import asyncio
import json

from scripts.python.plugins.audit import audit_plugin
from scripts.python.plugins.cli import (
    build_snapshot,
    enable_plugin,
    existing_pipeline_urls,
    find_in_registry,
    find_manifest,
    load_skill,
    load_plugin_config,
    parse_markdown_table,
    read_lock,
    remove_plugin,
    sanitize_job,
    set_enabled,
)
from scripts.python.plugins.engine import (
    HOOK_KINDS,
    RUNNABLE_HOOKS,
    DEFAULT_HOOK_TIMEOUT_MS,
    discover_plugins,
    diff_plugin,
    import_hook,
    load_plugins,
    lock_gate,
    plugin_settings,
    plugin_status,
    redact_log,
    run_hook,
    scoped_env,
    validate_manifest,
)
from scripts.python.plugins.install import parse_repo_arg, scaffold_new, validate_install
from scripts.python.plugins.validate_registry import (
    validate_registry,
    validate_registry_entry,
)


def write_manifest(directory, manifest):
    directory.mkdir(parents=True, exist_ok=True)
    (directory / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
    (directory / "index.mjs").write_text("export default {};\n", encoding="utf-8")


def valid_manifest(plugin_id="my-plugin"):
    return {
        "id": plugin_id,
        "apiVersion": 1,
        "description": "One line",
        "hooks": ["provider"],
        "requiredEnv": [],
        "optionalEnv": ["MY_PLUGIN_OPTIONAL"],
        "allowedHosts": [],
        "entry": "index.mjs",
        "skill": "skill.md",
        "humanInTheLoop": True,
    }


def valid_registry_entry(plugin_id="foo"):
    return {
        "name": f"career-ops-plugin-{plugin_id}",
        "id": plugin_id,
        "repo": "https://github.com/acme/foo",
        "sha": "a" * 40,
        "hooks": ["provider"],
        "requiredEnv": [],
        "allowedHosts": [],
        "license": "MIT",
        "version": "1.0.0",
    }


def test_validate_manifest_accepts_normalized_manifest(tmp_path):
    plugin_dir = tmp_path / "my-plugin"
    plugin_dir.mkdir()
    (plugin_dir / "skill.md").write_text("# Skill\n", encoding="utf-8")

    manifest = validate_manifest(valid_manifest(), plugin_dir)

    assert manifest is not None
    assert manifest["id"] == "my-plugin"
    assert manifest["entry"] == "index.mjs"
    assert manifest["skill"] == "skill.md"
    assert manifest["dir"] == str(plugin_dir)


def test_validate_manifest_rejects_security_sensitive_shapes(tmp_path):
    plugin_dir = tmp_path / "my-plugin"
    plugin_dir.mkdir()
    (plugin_dir / "skill.md").write_text("# Skill\n", encoding="utf-8")

    cases = [
        {"requiredEnv": ["OPENAI_API_KEY"], "allowedHosts": ["api.example.com"]},
        {"requiredEnv": ["MY_PLUGIN_KEY"], "allowedHosts": []},
        {"allowedHosts": ["127.0.0.1"]},
        {"entry": "../index.mjs"},
        {"entry": "index.js"},
        {"skill": "missing.md"},
    ]
    for override in cases:
        manifest = valid_manifest()
        manifest.update(override)
        assert validate_manifest(manifest, plugin_dir) is None


def test_discover_plugins_preserves_root_precedence_unless_overridden(tmp_path):
    bundled = tmp_path / "plugins"
    local = tmp_path / "plugins.local"
    first = valid_manifest("foo")
    first["description"] = "bundled"
    second = valid_manifest("foo")
    second["description"] = "local"
    write_manifest(bundled / "foo", first)
    write_manifest(local / "foo", second)
    (bundled / "foo" / "skill.md").write_text("# Skill\n", encoding="utf-8")
    (local / "foo" / "skill.md").write_text("# Skill\n", encoding="utf-8")

    assert discover_plugins([bundled, local])[0]["description"] == "bundled"
    assert discover_plugins([bundled, local], override_ids={"foo"})[0]["description"] == "local"


def test_plugin_status_requires_config_and_env():
    manifest = {"id": "foo", "requiredEnv": ["FOO_TOKEN"]}
    cfg = {"plugins": {"foo": {"enabled": True}}}

    assert plugin_status(manifest, cfg, env={}) == {
        "enabled": False,
        "configured": True,
        "missingEnv": ["FOO_TOKEN"],
    }
    assert plugin_status(manifest, cfg, env={"FOO_TOKEN": "x"}) == {
        "enabled": True,
        "configured": True,
        "missingEnv": [],
    }


def test_audit_plugin_flags_unsafe_javascript(tmp_path):
    clean = tmp_path / "clean"
    clean.mkdir()
    (clean / "index.mjs").write_text(
        'import fs from "node:fs";\nimport helper from "./helper.mjs";\nctx.fetch("https://example.com");\n',
        encoding="utf-8",
    )
    (clean / "helper.mjs").write_text("export default {};\n", encoding="utf-8")
    assert audit_plugin(clean) == {"ok": True, "findings": []}

    bad = tmp_path / "bad"
    bad.mkdir()
    (bad / "index.mjs").write_text(
        'import { spawn } from "child_process";\n'
        'import lodash from "lodash";\n'
        'fetch("https://example.com");\n'
        'eval("1 + 1");\n',
        encoding="utf-8",
    )

    issues = [finding["issue"] for finding in audit_plugin(bad)["findings"]]
    assert any("forbidden import" in issue for issue in issues)
    assert any("bare-specifier import" in issue for issue in issues)
    assert any("direct global fetch" in issue for issue in issues)
    assert any("eval/new Function" in issue for issue in issues)


def test_validate_registry_entry_checks_contract():
    assert validate_registry_entry(valid_registry_entry()) == []

    invalid = valid_registry_entry()
    invalid["requiredEnv"] = ["OPENAI_API_KEY"]
    invalid["supersedesBundled"] = False

    errors = validate_registry_entry(invalid)
    assert "requiredEnv declares a reserved/core-owned var" in errors
    assert "supersedesBundled, if present, must be the boolean true" in errors

    keyed = valid_registry_entry()
    keyed["requiredEnv"] = ["FOO_TOKEN"]
    keyed["allowedHosts"] = []
    assert "a keyed plugin must declare allowedHosts" in validate_registry_entry(keyed)


def test_validate_registry_reads_split_registry_and_supersedes_bundled(tmp_path):
    registry_dir = tmp_path / "plugins-registry"
    registry_dir.mkdir()
    entry = valid_registry_entry("foo")
    (registry_dir / "foo.json").write_text(json.dumps(entry), encoding="utf-8")
    assert validate_registry(tmp_path) == []

    superseding = valid_registry_entry("bar")
    superseding["supersedesBundled"] = True
    (registry_dir / "bar.json").write_text(json.dumps(superseding), encoding="utf-8")
    problems = validate_registry(tmp_path)
    assert any("no bundled plugin" in problem for problem in problems)

    bundled = tmp_path / "plugins" / "bar"
    bundled.mkdir(parents=True)
    (bundled / "manifest.json").write_text("{}", encoding="utf-8")
    assert validate_registry(tmp_path) == []

    mismatch = valid_registry_entry("baz")
    (registry_dir / "wrong-name.json").write_text(json.dumps(mismatch), encoding="utf-8")
    assert any("filename must equal" in problem for problem in validate_registry(tmp_path))


def test_install_parse_repo_arg_and_validate_install(tmp_path):
    assert parse_repo_arg("acme/career-ops-plugin-foo") == {
        "url": "https://github.com/acme/career-ops-plugin-foo",
        "id": "foo",
    }
    assert parse_repo_arg("https://github.com/acme/career-ops-plugin-bar.git") == {
        "url": "https://github.com/acme/career-ops-plugin-bar",
        "id": "bar",
    }

    try:
        parse_repo_arg("https://evil.example/acme/career-ops-plugin-foo")
    except ValueError as error:
        assert "refusing non-GitHub" in str(error)
    else:
        raise AssertionError("unsafe repo accepted")

    plugin = tmp_path / "foo"
    plugin.mkdir()
    manifest = valid_manifest("foo")
    manifest.pop("skill")
    (plugin / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
    (plugin / "index.mjs").write_text("export default {};\n", encoding="utf-8")
    (plugin / "README.md").write_text("# Foo\n", encoding="utf-8")
    (plugin / "LICENSE").write_text("MIT\n", encoding="utf-8")

    result = validate_install(plugin, "foo")
    assert result["ok"] is True
    assert result["manifest"]["id"] == "foo"

    (plugin / "bad.mjs").write_text('import cp from "child_process";\n', encoding="utf-8")
    bad = validate_install(plugin, "foo")
    assert bad["ok"] is False
    assert any("forbidden import" in problem for problem in bad["problems"])


def test_scaffold_new_replaces_template_placeholders(tmp_path):
    template = tmp_path / "plugins" / "_template"
    template.mkdir(parents=True)
    (template / "manifest.json").write_text('{"id":"{{NAME}}"}', encoding="utf-8")
    (template / "README.md").write_text("Plugin {{NAME}}", encoding="utf-8")

    destination = scaffold_new(tmp_path, "local-plugin")

    assert destination == tmp_path / "plugins.local" / "local-plugin"
    assert "{{NAME}}" not in (destination / "README.md").read_text(encoding="utf-8")
    assert '"local-plugin"' in (destination / "manifest.json").read_text(encoding="utf-8")


def test_cli_markdown_pipeline_and_job_helpers(tmp_path):
    assert sanitize_job({"title": " Engineer ", "url": " https://example.com/job ", "company": " Acme "}) == {
        "title": "Engineer",
        "url": "https://example.com/job",
        "company": "Acme",
    }
    assert sanitize_job({"title": "Engineer", "url": "ftp://example.com/job"}) is None

    markdown = """
| Company | Role |
|---|---|
| Acme | Engineer |
"""
    assert parse_markdown_table(markdown) == [{"company": "Acme", "role": "Engineer"}]

    pipeline = tmp_path / "pipeline.md"
    pipeline.write_text("- [ ] https://example.com/a\n- [x] https://example.com/b\n", encoding="utf-8")
    assert existing_pipeline_urls(pipeline) == {"https://example.com/a", "https://example.com/b"}

    (tmp_path / "data").mkdir()
    (tmp_path / "data/applications.md").write_text(markdown, encoding="utf-8")
    snapshot = build_snapshot(tmp_path)
    assert snapshot["applications"] == [{"company": "Acme", "role": "Engineer"}]
    assert snapshot["pipeline"] == []


def test_cli_enable_skill_and_remove_plugin(tmp_path):
    plugin = tmp_path / "plugins" / "foo"
    manifest = valid_manifest("foo")
    manifest["hooks"] = ["search"]
    write_manifest(plugin, manifest)
    (plugin / "skill.md").write_text("# Foo Skill\n", encoding="utf-8")

    discovered = discover_plugins([tmp_path / "plugins"])[0]
    assert load_skill(discovered)["body"] == "# Foo Skill\n"

    preview = enable_plugin(tmp_path, "foo", confirm=False)
    assert preview["confirmed"] is False
    assert "Plugin:        foo" in preview["card"]

    enabled = enable_plugin(tmp_path, "foo", confirm=True)
    assert enabled["confirmed"] is True
    assert read_lock(tmp_path)["plugins"]["foo"]["consent"]["hooks"] == ["search"]

    config = (tmp_path / "config/plugins.yml").read_text(encoding="utf-8")
    assert "enabled: true" in config

    set_enabled(tmp_path, "foo", False, {"setting": "kept"})
    updated = (tmp_path / "config/plugins.yml").read_text(encoding="utf-8")
    assert "enabled: false" in updated
    assert "setting: kept" in updated

    remove_plugin(tmp_path, "foo")
    assert read_lock(tmp_path)["plugins"] == {}
    assert "enabled: false" in (tmp_path / "config/plugins.yml").read_text(encoding="utf-8")


def test_import_hook_loads_py_plugin(tmp_path):
    plugin_dir = tmp_path / "my-plugin"
    plugin_dir.mkdir()
    manifest = valid_manifest("my-plugin")
    manifest["hooks"] = ["ingest"]
    manifest.pop("skill")
    (plugin_dir / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
    (plugin_dir / "index.py").write_text(
        'def ingest(ctx):\n    return [{"title": "Job", "url": "https://example.com/job"}]\n',
        encoding="utf-8",
    )
    manifest["entry"] = "index.py"
    m = validate_manifest(manifest, plugin_dir)
    hook = import_hook(m, "ingest")
    assert hook is not None
    assert callable(hook)
    result = hook({})
    assert isinstance(result, list)
    assert result[0]["title"] == "Job"


def test_import_hook_returns_none_for_missing_hook(tmp_path):
    plugin_dir = tmp_path / "my-plugin"
    plugin_dir.mkdir()
    manifest = valid_manifest("my-plugin")
    manifest["hooks"] = ["ingest"]
    manifest.pop("skill")
    (plugin_dir / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
    (plugin_dir / "index.py").write_text('SEARCH = "hello"\n', encoding="utf-8")
    manifest["entry"] = "index.py"
    m = validate_manifest(manifest, plugin_dir)
    assert import_hook(m, "ingest") is None
    assert import_hook(m, "search") is None


def test_run_hook_executes_across_plugins(tmp_path):
    plugin_dir = tmp_path / "plugins" / "testplug"
    plugin_dir.mkdir(parents=True)
    manifest = valid_manifest("testplug")
    manifest["hooks"] = ["ingest"]
    manifest.pop("skill")
    manifest["entry"] = "index.py"
    (plugin_dir / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
    (plugin_dir / "index.py").write_text(
        'def ingest(ctx):\n    return [{"title": "Found", "url": "https://example.com/1"}]\n',
        encoding="utf-8",
    )
    (tmp_path / "config").mkdir()
    (tmp_path / "config" / "plugins.yml").write_text(
        "plugins:\n  testplug:\n    enabled: true\n",
        encoding="utf-8",
    )
    results = asyncio.run(run_hook("ingest", None, root=tmp_path, dry_run=True))
    assert len(results) == 1
    assert results[0]["ok"] is True
    assert results[0]["id"] == "testplug"
    assert isinstance(results[0]["result"], list)
    assert results[0]["result"][0]["title"] == "Found"


def test_run_hook_skips_disabled_plugins(tmp_path):
    plugin_dir = tmp_path / "plugins" / "disabled"
    plugin_dir.mkdir(parents=True)
    manifest = valid_manifest("disabled")
    manifest["hooks"] = ["search"]
    manifest.pop("skill")
    (plugin_dir / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
    (plugin_dir / "index.py").write_text(
        'def search(query, ctx):\n    return []\n',
        encoding="utf-8",
    )
    (tmp_path / "config").mkdir()
    (tmp_path / "config" / "plugins.yml").write_text(
        "plugins:\n  disabled:\n    enabled: false\n",
        encoding="utf-8",
    )
    results = asyncio.run(run_hook("search", "query", root=tmp_path))
    assert results == []


def test_diff_plugin_unpinned():
    manifest = {"id": "foo", "dir": "/tmp/foo", "allowedHosts": [], "requiredEnv": [], "version": "1.0.0"}
    assert diff_plugin(manifest, None) == "unpinned"


def test_diff_plugin_match(tmp_path):
    plugin_dir = tmp_path / "foo"
    plugin_dir.mkdir()
    (plugin_dir / "file.txt").write_text("hello", encoding="utf-8")
    from scripts.python.plugins.install import hash_plugin_tree
    tree = hash_plugin_tree(plugin_dir)
    manifest = {"id": "foo", "dir": str(plugin_dir), "allowedHosts": [], "requiredEnv": [], "version": "1.0.0"}
    lock_entry = {"integrity": tree["integrity"], "version": "1.0.0", "consent": {"allowedHosts": [], "requiredEnv": [], "allowsLocalhost": False}}
    assert diff_plugin(manifest, lock_entry) == "match"


def test_lock_gate_allows_unpinned(tmp_path):
    manifest = {"id": "foo", "dir": str(tmp_path / "plugins" / "foo"), "hooks": ["ingest"], "allowedHosts": [], "requiredEnv": [], "version": "1.0.0"}
    assert lock_gate(manifest, tmp_path)["load"] is True


def test_scoped_env_filters_vars():
    manifest = {"id": "foo", "requiredEnv": ["MY_KEY"], "optionalEnv": ["MY_OPT"]}
    env = {"MY_KEY": "secret", "MY_OPT": "opt_val", "OTHER": "other"}
    assert scoped_env(manifest, env) == {"MY_KEY": "secret", "MY_OPT": "opt_val"}


def test_plugin_settings_extracts_non_enabled():
    cfg = {"plugins": {"foo": {"enabled": True, "label": "test", "days_back": 7}}}
    manifest = {"id": "foo"}
    assert plugin_settings(manifest, cfg) == {"label": "test", "days_back": 7}


def test_redact_log_replaces_sensitive_values():
    env = {"MY_TOKEN": "supersecret123"}
    msg = "Using token supersecret123 for auth"
    assert redact_log(msg, list(env.keys()), env=env) == "Using token [REDACTED:MY_TOKEN] for auth"


def test_find_in_registry_finds_entry(tmp_path):
    registry_dir = tmp_path / "plugins-registry"
    registry_dir.mkdir()
    entry = valid_registry_entry("myplug")
    (registry_dir / "myplug.json").write_text(json.dumps(entry), encoding="utf-8")
    assert find_in_registry(tmp_path, "myplug") is not None
    assert find_in_registry(tmp_path, "nonexistent") is None


def test_cli_available_lists_registry_entries(tmp_path, capsys):
    registry_dir = tmp_path / "plugins-registry"
    registry_dir.mkdir()
    entry = valid_registry_entry("foo")
    entry["hooks"] = ["ingest"]
    (registry_dir / "foo.json").write_text(json.dumps(entry), encoding="utf-8")
    from scripts.python.plugins.cli import main
    code = main(["--root", str(tmp_path), "available"])
    assert code == 0
    output = capsys.readouterr().out
    assert "foo" in output
    assert "ingest" in output
    assert "available" in output


def test_cli_trust_re_pins_integrity(tmp_path):
    plugin_dir = tmp_path / "plugins" / "foo"
    plugin_dir.mkdir(parents=True)
    manifest = valid_manifest("foo")
    manifest["hooks"] = ["search"]
    manifest.pop("skill")
    (plugin_dir / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
    (plugin_dir / "index.mjs").write_text("export default {};\n", encoding="utf-8")
    (tmp_path / "config").mkdir()
    (tmp_path / "config" / "plugins.yml").write_text("plugins:\n  foo:\n    enabled: true\n", encoding="utf-8")
    from scripts.python.plugins.cli import main
    code = main(["--root", str(tmp_path), "trust", "foo"])
    assert code == 0
    lock = read_lock(tmp_path)
    assert "foo" in lock["plugins"]
    assert lock["plugins"]["foo"]["integrity"].startswith("sha256-")
