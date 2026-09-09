# claude-muse-installer

Installs a user-scoped `claude-muse` command that runs Claude Code against the direct Meta Model
API (`muse-spark-1.3-contributor`), on Linux, macOS, WSL, Git Bash **and** native Windows — then
verifies the installation end to end.

Paste [`prompt.md`](prompt.md) into Claude Code on the machine you want to set up. The agent
detects the platform once and follows only that branch; it writes the files, runs thirty-seven offline
tests, and finishes with live smoke tests. It does not just print commands for you to run.

## Requirements

- Node.js 18.8 or newer (`server.closeAllConnections()` landed in 18.2.0, and the offline
  tests use the `node:test` `after` hook, which landed in 18.8.0)
- Claude Code already installed (`claude.exe`/`claude.com` on `PATH`, or an npm shim on Windows)
- No root, no administrator elevation — everything lands in the home directory
- A Meta Model API key, which **you** add locally after the files exist

## What gets installed

```text
~/.local/bin/claude-muse             POSIX only, mode 700
~/.local/bin/claude-muse.cmd         Windows only, CRLF
~/.local/lib/claude-muse/launcher.cjs        config, environment, process, platform decisions
~/.local/lib/claude-muse/adapter.cjs         loopback proxy and tool-name aliasing
~/.local/lib/claude-muse/launcher.test.cjs   seventeen offline tests
~/.local/lib/claude-muse/adapter.test.cjs    twenty offline tests
~/.local/lib/claude-muse/README.md           why each setting is what it is
~/.config/claude-muse/provider.env   base URL, model, effort, idle timeout — and your key
```

The launcher scrubs Anthropic and experimental variables out of the child environment, maps every
internal model role (Fable, Opus, Sonnet, Haiku, subagents) to the Contributor model ID, and pins
`CLAUDE_CODE_MAX_CONTEXT_TOKENS=1048576` so Claude Code stops assuming a 200,000-token window for
an unknown model ID. The adapter is a loopback proxy; the next section says what it is for.

## What the adapter is for

Meta's Model API is Anthropic-compatible, and [their own guide][coding-agents] connects Claude Code
to it with environment variables alone — no proxy. That holds until Claude Code sends a field Meta
does not accept, and then the request fails outright. Each of these was hit in practice, not
anticipated:

| What Claude Code sends | What Meta answers | What the adapter does |
| --- | --- | --- |
| A tool `name` over 64 characters | `name must be at most 64 characters` | Substitutes a deterministic hashed alias, restores the real name in the reply |
| `cache_control` carrying `ttl` or `scope` | `cache_control.ttl: 1h is not supported` | Reduces it to the plain `{"type":"ephemeral"}` form |
| `max_uses` on `web_search_20250305` | `web_search field max_uses is not supported` | Drops the field; the provider applies its own cap |
| `stop_sequences` on the auto-mode classifier | `stop_sequences is not supported` | Drops the field |

The last row is worth spelling out, because its symptom names nothing. Claude Code reports that
particular 400 as *"the model is temporarily unavailable"*, so auto mode stops running Bash, Edit
and Agent while reading files carries on working — which looks like an outage rather than a
rejected field.

The adapter rewrites protocol metadata only. Tool inputs, tool schemas and message text pass
through untouched, so a field named `cache_control` inside an MCP tool's own schema stays exactly
as that tool defined it.

In a typical setup only one MCP tool name crosses 64 characters, which makes the proxy look
avoidable. It is not: `ENABLE_TOOL_SEARCH=true` changes *when* that definition travels, not
whether, and one long name fails every request that carries it.

## Why tool search stays off

The launcher pins `ENABLE_TOOL_SEARCH=false`. Deferred Tool Search and the aliasing above cannot
both be right, and the conflict has no fix inside the adapter.

Aliasing rewrites protocol metadata and only that: a `name` in a tool definition, a `tool_use`
block, a `tool_reference`. Tool inputs pass through untouched, deliberately, because nothing in a
string tells the adapter whether it is a tool name or a sentence a tool was handed.

`ToolSearch` puts a tool name in a tool input. Its `select:` query names the tool to load, and
Claude Code matches that query against the registry it built before anything reached the adapter.

The model is shown two spellings of one tool, and the split follows the adapter's own boundary
exactly. The listing of deferred tools arrives as message text, which the adapter never rewrites,
so a real name is what the model reads there. Everything the adapter does rewrite carries the
alias: the definition a tool is loaded under, and the `tool_reference` inside the search result
that loaded it. A search quoting the listing therefore succeeds, and the one the model issues
afterwards — quoting the tool as it now appears in its own definition — matches nothing:

```text
query  select:mcp__muse_search_probe__lookup_the_installation_marker_for_the_long_name_check
reply  a tool_reference

query  installation marker
reply  three tool_references

query  select:muse_lookup_the_installation_marker_for_the_lon_b95636815567c18b
reply  No matching deferred tools found
```

The third query is the alias the adapter minted for the tool the first one found. The log is the
session's own view, where a reference still reads as the name it carried before it went out.
Semantic queries keep working, so the session does not look broken; only the round trips that name
an aliased tool come back empty, and those are the ones the model reaches for once it has a
definition in hand. Reproduced against a stdio MCP server exposing six tools, one of them 77
characters once Claude Code had prefixed it.

Un-aliasing a name inside a `ToolSearch` query would mean reading and rewriting tool input, which
is the one thing this adapter refuses to do — the `cache_control` inside an MCP tool's own schema
survives for exactly the same reason. Loading every schema directly costs context and settles it.

## When something stops working

Meta refuses one unsupported field at a time, and Claude Code renders most of those refusals as the
same "temporarily unavailable" sentence. Run with `--muse-debug` and the adapter records what it
sent and what came back, to a file whose path is printed at startup:

```powershell
claude-muse --muse-debug
```

Use `--muse-debug=C:\path\to\file.log` to choose the file, or set `MUSE_DEBUG_LOG` in the
environment for a scripted session. The flag is namespaced because Claude Code has a `--debug` of
its own; the launcher removes only its own flag and passes everything else through.

One JSON object per line: the shape of a request (model, whether it streams, how many tools, the
longest tool name), the status of the reply, and the `type` and `message` a failing reply declares.
Headers, the key and the content of messages are never written.

An error body is never copied whole, because a provider may quote the request it refused or the
authorization it rejected. Only those two declared fields are logged — capped, and scrubbed of any
credential — and a body of any other shape is recorded by size alone. A streaming reply that fails
after its `200` is recorded too, beside the status that no longer describes it.

The log is created `0600`, and a generated name carries random bytes as well as a timestamp, because
the default lands in a directory shared with every other account on the machine. Without the flag
nothing is logged and no file is opened.

[coding-agents]: https://dev.meta.ai/docs/guides/coding-agents

## Web search

Meta's `web_search_20250305` accepts only `type`, `name`, `user_location` and `cache_control`.
Claude Code always sends `max_uses` as well, so without the adapter every WebSearch call fails
with `400 web_search field "max_uses" is not supported` and the model silently answers from
memory instead. The adapter drops `max_uses` — the provider applies its own cap — and search
works.

`allowed_domains` and `blocked_domains` are rejected by Meta too, but the adapter does not drop
them: they are a restriction the operator configured, and searching without them would reach
domains that were deliberately excluded. A request carrying either one is refused locally with an
explanation. Remove the domain filter from your Claude Code settings, or turn WebSearch off.

Meta's server-side search covers page fetches through the same tool; the separate
`web_fetch_20250910` tool type is not supported by the provider at all.

## Long turns

A request is abandoned after `MUSE_IDLE_TIMEOUT_SECONDS` of complete silence, 300 by default —
whether the silence falls while the request is still being uploaded or while the answer streams
back. That is an idle timer, not a wall clock — every byte in either direction restarts it — so a
high-effort turn over a large context streams for as long as it needs. A fixed cutoff would cut
healthy streams off mid-answer, and after the response headers have been sent there is no way
left to report an error, so the turn would just arrive truncated.

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

## Before you run it

- **The Contributor model permits Meta to use submitted inputs and outputs for model and product
  improvement.** The prompt makes the agent state this before the first live call.
- **On Windows, `provider.env` is not mode 600.** NTFS has no POSIX permission bits and the
  install deliberately does not touch ACLs, so the key file is readable by any process running as
  you, by local administrators and by `SYSTEM`. The install says so, and so does its final report.
- **Under Git Bash the home directory is Node's, not the shell's.** Git Bash is a POSIX shell
  driving a Windows Node runtime, so `os.homedir()` returns `%USERPROFILE%` even when `$HOME`
  points elsewhere. The install resolves the home once with `node -p "require('os').homedir()"`,
  puts everything there, and reports the substitution — otherwise the launcher would look for
  `provider.env` in a directory the installer never wrote to. Shell-side entries such as the
  `PATH` line use the MSYS spelling of that same directory (`/c/Users/you`), because bash reads
  the drive-letter colon in `C:\Users\you` as a `PATH` separator.

## Running it

```text
claude-muse                # interactive session
claude-muse --continue     # resume the previous one
claude-muse --effort low   # override the default effort
```

`~/.local/bin` is added to `PATH` idempotently during the install. On Windows the user-level
`Path` is set through `[Environment]::SetEnvironmentVariable` rather than `setx`, which truncates
values at 1024 characters — and the change only reaches newly opened terminals.

## Changing it

The prompt is generated. Its prose lives in `prompt.template.md`, the eight files it dictates live
in `sources/`, and `prompt.md` is what the two produce:

```text
claude-muse-installer/
├── prompt.template.md   the prose, with a marker where each file goes
├── sources/             the eight files, mirroring the installed tree
├── build.cjs            template + sources -> prompt.md
└── prompt.md            generated, committed, and the file you paste
```

Edit code in `sources/`, never in `prompt.md`, then rebuild and commit both:

```text
node claude-muse-installer/build.cjs
```

The checker fails if you forget, and says what to run. Fence length is computed rather than chosen,
so a file that contains a fence of its own is wrapped in a longer one automatically — including a
fence indented under three spaces, which CommonMark lets close a block just as one at column zero
does. That is the failure that once truncated the installed README to a third of its length, and it
can no longer be written by hand.

Sources are LF only and must end with a newline. `build.cjs` refuses one carrying a carriage return
and `check.cjs` refuses a prompt that carries one, because a CR copied into the POSIX shim would
leave `#!/usr/bin/env bash` followed by a carriage return, which is not a shebang. A missing final
newline is refused for a quieter reason: the block would carry one anyway, so the installed file
would end up a byte longer than the source it came from, and the copy-over recipe above would stop
being true.

`sources/` mirrors the installed tree minus the leading dots, so every file sits where its
installed twin does. The launcher, the adapter, their two suites and the installed README are the
bytes an install writes, and a machine whose adapter has stopped working is repaired by copying
one over its twin, with no reinstall:

```text
cp claude-muse-installer/sources/lib/claude-muse/adapter.cjs ~/.local/lib/claude-muse/
node --test ~/.local/lib/claude-muse/*.test.cjs
```

The other three are transformed on the way in, each for a reason, and none of them should be
copied blind:

- `provider.env` gains the key you paste into it. Never overwrite it from here.
- `claude-muse.cmd` is written with CRLF, which the prompt itself cannot carry. Convert it on the
  way if you replace it on Windows: a batch shim with LF endings is not reliably run by
  `cmd.exe`.
- `claude-muse`, the POSIX shim, keeps the source verbatim on Linux, macOS and WSL. Under Git Bash
  its last line is rewritten to resolve the home through Node when the shell's `$HOME` and
  `os.homedir()` disagree, so check that line before replacing it there — the stock line would
  send the launcher looking for `provider.env` in a tree the install never wrote to.

The suites also run straight from the repository, which is the fast loop while changing the
adapter:

```text
node --test claude-muse-installer/sources/lib/claude-muse/*.test.cjs
```

## Checking the prompt

```text
node claude-muse-installer/check.cjs
```

Extracts all eight files the prompt dictates into a temporary directory, parses the JavaScript,
runs both test suites, checks that the test counts quoted in the prose match the counts that ran,
and rebuilds the prompt from `sources/` to confirm that the file you would paste is the code
somebody actually edited. It also refuses a fenced block that ends early because it contains a
fence of its own — the failure that once truncated the installed README to a third of its length.
No API key, no network, about two seconds. It verifies mechanism only; the prose still needs a
reader.

## Source

Generated from the "Claude Muse Installer" artifact (`muse-spark-1.3-contributor` revision):
<https://claude.ai/code/artifact/d1d01559-657c-450b-af63-494d3e81a561> (private).
