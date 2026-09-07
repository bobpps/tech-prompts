# claude-muse-installer

Installs a user-scoped `claude-muse` command that runs Claude Code against the direct Meta Model
API (`muse-spark-1.3-contributor`), on Linux, macOS, WSL, Git Bash **and** native Windows — then
verifies the installation end to end.

Paste [`prompt.md`](prompt.md) into Claude Code on the machine you want to set up. The agent
detects the platform once and follows only that branch; it writes the files, runs twelve offline
tests, and finishes with live smoke tests. It does not just print commands for you to run.

## Requirements

- Node.js 18 or newer
- Claude Code already installed (`claude.exe`/`claude.com` on `PATH`, or an npm shim on Windows)
- No root, no administrator elevation — everything lands in the home directory
- A Meta Model API key, which **you** add locally after the files exist

## What gets installed

```text
~/.local/bin/claude-muse             POSIX only, mode 700
~/.local/bin/claude-muse.cmd         Windows only, CRLF
~/.local/lib/claude-muse/launcher.cjs        config, environment, process, platform decisions
~/.local/lib/claude-muse/adapter.cjs         loopback proxy and tool-name aliasing
~/.local/lib/claude-muse/launcher.test.cjs   eight offline tests
~/.local/lib/claude-muse/adapter.test.cjs    four offline tests
~/.local/lib/claude-muse/README.md           why each setting is what it is
~/.config/claude-muse/provider.env   base URL, model, effort — and your key
```

The launcher scrubs Anthropic and experimental variables out of the child environment, maps every
internal model role (Fable, Opus, Sonnet, Haiku, subagents) to the Contributor model ID, and pins
`CLAUDE_CODE_MAX_CONTEXT_TOKENS=1048576` so Claude Code stops assuming a 200,000-token window for
an unknown model ID. The adapter is a loopback proxy that shortens tool names over Meta's
64-character limit and reduces `cache_control` to the plain `ephemeral` form Meta accepts.

Default effort is `high`, injected as a CLI argument, so `claude-muse --effort low` and the
in-session `/effort` command still win.

## What it leaves alone

- The normal `claude` command, `claude-qwen`, global settings, plugins, MCP servers, hooks, skills
  and permissions
- The shared `~/.claude` directory — `CLAUDE_CONFIG_DIR` is never set
- System locations: nothing is written to `/usr/local/bin` or `C:\Program Files`

Existing target files are inspected first. A non-empty `MUSE_AUTH_TOKEN` is preserved; anything
else is backed up, timestamped, under `~/.local/lib/claude-muse/backups/`.

## Handling the key

The prompt carries no API key and instructs the agent never to read one back. You open
`~/.config/claude-muse/provider.env` in your own editor and paste the key between the single
quotes, after the install has written the file. Never put the key in chat, a command-line
argument, shell history, a debug log or a repository.

## Two things to know before running it

- **The Contributor model permits Meta to use submitted inputs and outputs for model and product
  improvement.** The prompt makes the agent state this before the first live call.
- **On Windows, `provider.env` is not mode 600.** NTFS has no POSIX permission bits and the
  install deliberately does not touch ACLs, so the key file is readable by any process running as
  you, by local administrators and by `SYSTEM`. The install says so, and so does its final report.

## Running it

```text
claude-muse                # interactive session
claude-muse --continue     # resume the previous one
claude-muse --effort low   # override the default effort
```

`~/.local/bin` is added to `PATH` idempotently during the install. On Windows the user-level
`Path` is set through `[Environment]::SetEnvironmentVariable` rather than `setx`, which truncates
values at 1024 characters — and the change only reaches newly opened terminals.

## Source

Generated from the "Claude Muse Installer" artifact (`muse-spark-1.3-contributor` revision):
<https://claude.ai/code/artifact/d1d01559-657c-450b-af63-494d3e81a561> (private).
