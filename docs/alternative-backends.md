# Using career-ops with Alternative LLM Backends

career-ops is engine-first: the evaluation logic lives in the mode files (`modes/`), and the CLI that executes it is a pluggable detail.

**Interactive mode** already works with any CLI that reads a `CLAUDE.md` / `AGENTS.md` instruction file — just open the project directory with your tool of choice.

**Batch mode** (`batch/batch-runner.sh`) delegates each evaluation to a worker CLI via the `CAREER_OPS_CLI` environment variable.

## How it works

`batch-runner.sh` runs one command per job offer:

```
$CAREER_OPS_CLI \
  --append-system-prompt-file <resolved-prompt.md> \
  "<job url and metadata>"
```

Any CLI that accepts a system prompt file and a user message via flags can be plugged in.

## Configuration

Set `CAREER_OPS_CLI` before running the batch script:

```bash
export CAREER_OPS_CLI="claude -p"   # Claude Code — default
./batch/batch-runner.sh
```

Or inline per-run:

```bash
CAREER_OPS_CLI="opencode -f" ./batch/batch-runner.sh
```

## Supported backends

### Claude Code (default)

```bash
# No setup needed if claude is in PATH
./batch/batch-runner.sh
```

Requires a Claude Max subscription. See [claude.ai/code](https://claude.ai/code).

### opencode (OpenRouter / any provider)

[opencode](https://opencode.ai) is an open-source terminal AI assistant that supports the OpenAI-compatible API, making it compatible with OpenRouter's free-tier models.

```bash
# Install
npm install -g opencode-ai

# Configure OpenRouter as the provider
export OPENROUTER_API_KEY=sk-or-v1-...
export OPENCODE_MODEL=openrouter/google/gemini-2.5-pro:free

# Run batch
CAREER_OPS_CLI="opencode -f" ./batch/batch-runner.sh
```

Free models are available at [openrouter.ai/models](https://openrouter.ai/models?q=:free).

### Local models via LM Studio

LM Studio exposes a local OpenAI-compatible server. Any CLI that supports `OPENAI_BASE_URL` can point at it.

```bash
# Start LM Studio server (default port 1234)
# Then configure your CLI to point at it:
export OPENAI_BASE_URL=http://localhost:1234/v1
export OPENAI_API_KEY=lm-studio   # any non-empty string

CAREER_OPS_CLI="opencode -f" ./batch/batch-runner.sh
```

### Other CLIs

Any tool that matches this interface works:

```
<cli> --append-system-prompt-file <file> "<user message>"
```

If your CLI uses different flags, wrap it in a small shell script:

```bash
#!/usr/bin/env bash
# my-cli-wrapper.sh
my-ai-tool --system-file "$1" --prompt "$2"
```

```bash
CAREER_OPS_CLI="./my-cli-wrapper.sh" ./batch/batch-runner.sh
```

## Verifying your setup

```bash
# Dry run — confirms CLI is found without processing anything
./batch/batch-runner.sh --dry-run

# Process a single offer to test end-to-end
echo -e "id\turl\tsource\tnotes\n1\thttps://example.com/job\ttest\t" > batch/batch-input.tsv
CAREER_OPS_CLI="opencode -f" ./batch/batch-runner.sh --start-from 1 --parallel 1
```
