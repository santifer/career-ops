# career-ops Python scripts

Python ports of the deterministic `scripts/js/*.mjs` utilities.

The migration is incremental. Modules in this package should mirror the JS
behavior first, then become the import surface for Django management commands.

Run the local test slice with:

```bash
cd scripts/python
python -m pytest
```

From the repository root:

```bash
python -m pytest scripts/python/tests
```
