You are configuring this machine to run Claude Code through the direct Meta
Model API using `muse-spark-1.3-contributor`. Complete the installation and
verification end to end. Do not merely describe commands for me to run.

Important boundaries:

- Support Linux, macOS, WSL, and native Windows. Determine the platform once,
  before writing anything, and then follow only the rows and blocks marked for
  that platform. Treat WSL as POSIX. Git Bash and other MSYS shells are a POSIX
  shell driving a Windows Node runtime: install the POSIX files, but resolve the
  home directory the way Node does, never from the shell's `$HOME`.
- Work in the current user's home directory. Do not require root or
  administrator elevation, and do not put files in `/usr/local/bin`,
  `C:\Program Files`, or any system location.
- Do not modify or replace the normal `claude` command, `claude-qwen`, global
  Claude Code settings, plugins, MCP servers, hooks, skills, or permissions.
- Preserve the shared `~/.claude` directory. Do not set `CLAUDE_CONFIG_DIR`.
- Never ask me to paste an API key into chat, a prompt, command-line argument,
  shell history, debug log, or repository. Never print or read back the key.
- The Contributor model permits Meta to use submitted inputs and outputs for
  model/product improvement. State this before the first live API test.
- Use `apply_patch` or your normal structured file-writing tool for file edits.
  Do not interpolate the API key into generated commands or output.

Throughout this prompt, `~` means the current user's home directory as Node
reports it from `os.homedir()`: `$HOME` on POSIX, `%USERPROFILE%` on Windows.
Resolve it once, before writing anything, with:

```bash
node -p "require('os').homedir()"
```

The shell's `$HOME` is not authoritative. Under Git Bash or another MSYS shell,
`node` is a Windows program and reports `%USERPROFILE%`, which the user may have
configured `$HOME` to differ from. `launcher.cjs` always locates `provider.env`
through `os.homedir()`, so a tree installed under a divergent `$HOME` would
leave every launch failing with `configuration not found`.

If the two paths disagree, install under the Node-reported path, and replace
`$HOME` in the POSIX blocks below with the spelling each place needs. The two
spellings name the same physical directory:

```bash
node -p "require('os').homedir()"        # C:\Users\you   — native, for Node
cygpath -u "$(node -p "require('os').homedir()")"   # /c/Users/you — MSYS, for the shell
```

- Anywhere the shell itself reads the path, it needs the MSYS form. A native
  path cannot go on `PATH`: bash splits on the colon, so `C:\Users\you\.local\bin`
  becomes the two useless entries `C` and `\Users\you\.local\bin`, and a fresh
  terminal never finds `claude-muse`. If `cygpath` is unavailable, the
  conversion is mechanical: `C:\Users\you` is `/c/Users/you`.
- For the commands you run yourself — the verification commands, the editor
  invocation — do not paste that path into them. Set it once, at the start of
  the shell session, and use `"$muse_home"` wherever the blocks below say
  `"$HOME"`:

  ```bash
  muse_home="$(cygpath -u "$(node -p "require('os').homedir()")")"
  ```

  A value that arrives through a variable is used as it stands; a value typed
  into the command line is read by bash first, and `$`, a backtick and a quote
  are all legal in a Windows profile path.
- The launcher shim takes no substituted path at all. It resolves the home at
  run time, the same way the launcher itself does. A path pasted into its `exec`
  line would have to survive bash's own quoting rules, and Windows allows `$`, a
  backtick and a single quote in a profile path: inside double quotes
  `C:\Users\a$b` expands to `C:\Users\a`, and a segment that begins with `$`
  swallows the separator in front of it, so the shim would point at a file that
  does not exist.

This governs the files this prompt installs. The shell's own startup file is not
one of them: it belongs to the shell and stays where the shell looks for it,
under the shell's `$HOME`. Written under the Node-reported home instead, bash
would never read it and a fresh terminal would still not find `claude-muse`.
Only the path written inside that file points at the installed tree.

State the substitution, and both spellings, in the final report.

The layout below is identical on every platform except the launcher's file
extension.

The final installation consists of:

```text
~/.local/bin/claude-muse           POSIX only
~/.local/bin/claude-muse.cmd       Windows only
~/.local/lib/claude-muse/launcher.cjs
~/.local/lib/claude-muse/adapter.cjs
~/.local/lib/claude-muse/launcher.test.cjs
~/.local/lib/claude-muse/adapter.test.cjs
~/.local/lib/claude-muse/README.md
~/.config/claude-muse/provider.env
```

First inspect the environment:

1. Identify the platform: POSIX (Linux, macOS, WSL, Git Bash) or native
   Windows. Report which one you will install for. Under Git Bash or another
   MSYS shell, print both `$HOME` and `node -p "require('os').homedir()"` and
   report whether they agree; if they do not, the Node-reported path is the one
   the installation uses.
2. Confirm that `node` and `claude` are available. On POSIX also confirm
   `bash`. On native Windows confirm PowerShell — Windows PowerShell 5.1, which
   ships with the system, or PowerShell 7 or newer — and report the version.
   Every Windows step below is written in it: the `Path` edit needs
   `[Environment]::SetEnvironmentVariable`, and the verification and smoke-test
   blocks are PowerShell throughout. If it is missing or blocked by policy,
   stop and say so rather than starting an install that cannot be finished.
   This is a requirement for installing, not for running: the installed
   `claude-muse.cmd` is a batch shim and works from `cmd.exe` afterwards.
3. Require Node.js 18.8 or newer, and say why when you report the version.
   `http.Server.closeAllConnections()`, which the launcher calls on every exit
   and the adapter test calls during teardown, was added in Node 18.2.0; on
   earlier 18.x it throws instead, so the proxy is never closed and the launcher
   cannot exit cleanly. The `after` hook that `launcher.test.cjs` uses to remove
   its temporary directories was added in Node 18.8.0. If Node is missing or
   older, explain the exact prerequisite and pause before installing system
   software.
4. Print the Claude Code version, but do not invoke Anthropic authentication.
5. On native Windows, also record how Claude Code is installed: whether
   `claude.exe`/`claude.com` is on `PATH`, or only an npm shim `claude.cmd` is.
   The launcher supports both, and the report should say which one it will use.
6. Check whether `~/.local/bin` is on `PATH`. If it is not, add it idempotently
   and tell me exactly what changed.

   On POSIX, determine the user's login shell first and write to that shell's
   startup file, in that shell's own syntax. Name the file you chose.

   Under zsh, the default on macOS, that is `~/.zshrc`.

   Under bash, both startup modes have to end up with the entry, and the mode
   you are running in now tells you nothing about the one the user opens next: a
   login shell — an SSH session, a macOS terminal — reads the profile and not
   `~/.bashrc`, while an interactive non-login shell, which is what most
   terminal windows on Linux open, reads `~/.bashrc` and not the profile.
   Writing to only the file this session happens to use leaves `claude-muse`
   missing in the other.

   So:

   1. Find the login file: the first of `~/.bash_profile`, `~/.bash_login` and
      `~/.profile` that exists. Create `~/.bash_profile` only when none of the
      three does. Creating it next to an existing `~/.profile` would silently
      stop every line of that file from running at login, because bash reads
      only the first of the three it finds.
   2. Read that file. If it already sources `~/.bashrc` — a `.` or `source`
      line naming it, which is what many distributions ship — then `~/.bashrc`
      alone reaches both modes, and it is the only file to touch.
   3. Otherwise add the line to both the login file and `~/.bashrc`, creating
      `~/.bashrc` if it does not exist. Do not make the profile source
      `~/.bashrc` to avoid the second edit: that changes how every future login
      shell starts, which is far more than adding a directory to `PATH`.

   Add nothing that is already there, in either file. Report which files you
   chose, whether each already existed, and which of the two rules above
   applied.

   ```bash
   export PATH="$HOME/.local/bin:$PATH"
   ```

   Under Git Bash with a divergent `$HOME`, two homes meet in this one step. The
   startup file itself belongs to the shell, so it stays under the shell's
   `$HOME`, where bash actually looks for it — not under the Node-reported home,
   even though everything installed lives there. The path inside the line points
   at the installed tree, so write the MSYS spelling of the Node-reported home —
   never the native `C:\Users\you`, whose colon bash reads as a `PATH`
   separator — and write it in single quotes, joined to the existing `PATH`
   outside them:

   ```bash
   export PATH='/c/Users/you/.local/bin':"$PATH"
   ```

   This line is read afresh by every new terminal, so it is the one place a
   pasted path has to survive bash's quoting rules for good; double quotes would
   not let it. Windows permits `$` and a backtick in a profile directory, and
   `"/c/Users/a$b/.local/bin"` becomes `/c/Users/a` the moment the file is
   sourced, leaving `claude-muse` unfindable in a way that looks like the
   install never ran. Single quotes suspend all of it. If the path itself
   contains a single quote, close, escape and reopen — `'/c/Users/o'\''brien/…'`
   — which is the one case single quotes cannot express directly. Resolving the
   home in the startup file instead would mean starting Node in every new
   terminal, which is too much to charge a shell for one `PATH` entry.

   Under fish, `export` is not valid syntax and the file is
   `~/.config/fish/config.fish`. `fish_add_path` is idempotent by itself:

   ```fish
   fish_add_path "$HOME/.local/bin"
   ```

   Under any other login shell — tcsh, ksh, nushell — write the equivalent in
   that shell's syntax and say which syntax you used. If you cannot establish
   it, change nothing, and tell me the exact line to add and the file to add it
   to; do not silently fall back to `export`, which would leave a startup file
   that errors on every new terminal.

   On Windows, set the user-level `Path` variable. Use this, not `setx`, which
   truncates long values at 1024 characters and expands variables:

   ```powershell
   $target = Join-Path $env:USERPROFILE '.local\bin'
   $current = [Environment]::GetEnvironmentVariable('Path', 'User')
   if (($current -split ';') -notcontains $target) {
     [Environment]::SetEnvironmentVariable('Path', "$target;$current", 'User')
   }
   ```

   A user-level `Path` change reaches only new terminals. Say so.

7. If any target file already exists, inspect it first. Preserve an existing
   non-empty `MUSE_AUTH_TOKEN`. Before replacing any other existing target,
   make a timestamped backup under `~/.local/lib/claude-muse/backups/`, readable
   only by the current user where the platform allows it. Never display the
   secret while doing so. An installation that is already there is an update
   rather than a fresh install; follow the procedure directly below.

Updating an existing installation:

This prompt is also the update procedure. The blocks below are the current
contents of every installed file, so an installation that predates them is
brought forward by reconciling each file against its block. Nothing here
reaches the network or a repository, and there is no version to compare: the
blocks are authoritative, and an installed file that differs from its block is
either older than this prompt or locally modified. Both are resolved the same
way.

If `~/.local/lib/claude-muse` already exists, do this before writing anything:

- Compare each target file for this platform against its block by content, not
  by eye, and report which ones differ before changing any of them.
- Three files are deliberately not literal copies of their blocks. Comparing
  them naively reports a difference that is not one:
  - `~/.config/claude-muse/provider.env` carries the key. Keep an existing
    non-empty `MUSE_AUTH_TOKEN` line unchanged and reconcile only the other
    settings. Never print the key while comparing.
  - `~/.local/bin/claude-muse.cmd` is installed with CRLF line endings.
    Compare it with line endings normalised.
  - `~/.local/bin/claude-muse` has its last line rewritten under Git Bash where
    `$HOME` and `os.homedir()` disagree. Leave that rewrite in place, and
    re-apply it if you replace the file.
- Replace only the files that differ, backing each one up first as step 7 says.
  Leave earlier backups alone.
- Then run the offline tests and every live check below again, in full. An
  update is not finished when the files are written. The adapter is the layer
  that absorbs provider incompatibilities, so a changed adapter is exactly the
  thing that can turn a working installation into one that fails on every turn,
  and only a real session proves that it did not.

Report which files you replaced, which you left unchanged, and where the
backups went.

Permissions differ by platform, and this is the one place where the two
installations are not equivalent.

On POSIX, create these with exactly these modes:

```text
~/.local/bin                 existing permissions are acceptable
~/.local/lib/claude-muse     700
~/.config/claude-muse        700
~/.local/bin/claude-muse     700
~/.config/claude-muse/provider.env     600
all other installed files              600
```

On native Windows, create the same directories and files but set no modes.
NTFS has no POSIX permission bits, `fs.chmod` there controls only the read-only
flag, and this installation deliberately does not modify access-control lists.
`provider.env` inherits the rights of the user profile directory. State plainly,
during installation and again in the final report, that the key file is
therefore readable by any process running as this user, by local
administrators, and by `SYSTEM` — weaker protection than mode `600`. Do not run
`icacls` to change this; the README records the optional command for anyone who
wants it.

Create `~/.config/claude-muse/provider.env` with this exact content. On POSIX
give it mode `600`. If the file already contains a non-empty key, keep that line
unchanged and reconcile only the other settings.

<!-- muse:file sources/config/claude-muse/provider.env lang=bash -->

Do not enforce a particular textual format for the Meta key. Meta keys have
appeared in both pipe-delimited and underscore-delimited forms; non-empty is the
only launcher-side validation needed. The launcher reads this file as data and
never executes it, so shell metacharacters inside the key are inert.

On POSIX, create `~/.local/bin/claude-muse` with mode `700` and this exact
content:

<!-- muse:file sources/bin/claude-muse lang=bash -->

Where the shell's `$HOME` and the Node-reported home disagree — only possible
under Git Bash or another MSYS shell — change that last line, and only that
line, to ask Node where the home is, so the shim points at the tree the launcher
will actually read:

```bash
exec node "$(node -p 'require("os").homedir()')/.local/lib/claude-muse/launcher.cjs" "$@"
```

Do not paste the resolved path in instead. Command substitution hands its result
straight to the argument, so every character in the path is safe; a pasted path
is read by bash first, and a profile directory containing `$`, a backtick or a
single quote would be mangled before Node ever saw it. It also cannot go stale
if the profile moves. Node accepts the mixed separators in
`C:\Users\you/.local/...` as one argument.

On native Windows, create `~/.local/bin/claude-muse.cmd` with this exact
content, written with CRLF line endings:

<!-- muse:file sources/bin/claude-muse.cmd lang=bat -->

Create `~/.local/lib/claude-muse/launcher.cjs` with this exact content. This
file is identical on every platform; it decides what to do from
`process.platform` at run time.

<!-- muse:file sources/lib/claude-muse/launcher.cjs lang=javascript -->

Create `~/.local/lib/claude-muse/adapter.cjs` with this exact content:

<!-- muse:file sources/lib/claude-muse/adapter.cjs lang=javascript -->

Create `~/.local/lib/claude-muse/launcher.test.cjs` with this exact content:

<!-- muse:file sources/lib/claude-muse/launcher.test.cjs lang=javascript -->

Create `~/.local/lib/claude-muse/adapter.test.cjs` with this exact content:

<!-- muse:file sources/lib/claude-muse/adapter.test.cjs lang=javascript -->

Create `~/.local/lib/claude-muse/README.md` with this exact content. The block
is fenced with four backticks because the file itself contains fenced blocks;
everything up to the closing four-backtick line belongs in the file:

<!-- muse:file sources/lib/claude-muse/README.md lang=markdown -->

Why the launcher is Node and not a shell script:

- One installation has to serve four environments. A Bash launcher cannot run on
  native Windows, and a batch equivalent cannot be written safely: Meta keys
  contain `|`, which `cmd.exe` treats as a pipe operator, so `set` would break on
  the very first key it was given.
- Reading `provider.env` in JavaScript instead of `source`-ing it means the file
  is parsed, not executed. A key containing `|`, `&` or a backtick can no longer
  run anything.
- The real key is now passed to the adapter in memory. It is placed in no
  environment variable at all, so it does not appear in the process environment
  of the launcher or of Claude Code.
- `launcher.cjs` holds every platform decision; `adapter.cjs` has none, which
  keeps the proxy and the tool-name mapping identical and fully testable
  everywhere.

Why the local adapter is required:

- Meta rejects a tool `name` longer than 64 characters with HTTP 400. Claude
  Code plugin prefixes can produce names of 65-76 characters, notably for Chrome
  DevTools and Notion.
- The adapter shortens only API tool identifiers and reverses the mapping before
  Claude Code sees model responses. It must handle normal JSON, SSE streaming,
  `tool_use`, `server_tool_use`, `tool_reference.tool_name`, `tool_choice.name`,
  prior message history, and `allowed_callers`.
- Do not solve this by disabling all plugins or MCP servers. The shared Claude
  Code setup must remain usable.
- `ENABLE_TOOL_SEARCH=false` is deliberate, and the adapter is what settles it.
  Deferred Tool Search initially avoids sending long names, but when a long tool
  is loaded Meta still rejects it, so the alias is needed either way — and the
  alias is what breaks the search. `ToolSearch` carries the tool it wants inside
  a tool input, `select:<name>`, which Claude Code matches against the registry
  it built before anything reached the adapter; tool inputs are the one thing
  the adapter never rewrites. The model reads a real name in the listing of
  deferred tools, which travels as message text and is not rewritten either,
  while every place the adapter does rewrite — the definition a tool is loaded
  under, and the `tool_reference` inside the search result — carries the alias.
  So a `select:` quoting the listing succeeds, and the one quoting the
  definition returns `No matching deferred tools found`. During integration
  tests Muse also generated incorrect `default.`-prefixed names and omitted
  required arguments after deferred loading. Direct schema loading was reliable
  after aliasing.
- Meta rejects `stop_sequences` with HTTP 400, and Claude Code sends it on the
  auto-mode safety classifier call. Without the adapter, auto mode cannot judge
  any gated tool and reports the model as unavailable instead.

Why Claude Code is started the way it is on Windows:

- `child_process.spawn` cannot execute a `.cmd` shim without a shell, and
  handing my arguments to `cmd.exe` would require hand-written quoting that
  breaks on quotes, `%`, and empty arguments.
- Claude Code ships as a native binary: the npm package's postinstall copies it
  over `bin/claude.exe`, and on Windows that binary is named `claude.exe`. The
  launcher therefore runs `claude.exe`/`claude.com` directly when one is on
  `PATH`.
- If only the npm shim is on `PATH`, the launcher reads it to find the program
  behind it, using the expressions npm's own `read-cmd-shim` uses. The shim
  normally names the `.exe`; if it names a `.js` entry point instead, that runs
  under the same Node. Either way arguments pass verbatim and no shell is used.
- If neither is found, the launcher stops with an explanation rather than
  guessing. If you hit that, report it — do not add a `cmd.exe` fallback on your
  own initiative.
- `claude-muse.cmd` uses the `endLocal & goto #_undefined_#` idiom that npm's
  own `cmd-shim` writes into every shim, which suppresses the
  `Terminate batch job (Y/N)?` prompt on Ctrl+C.
- On Windows the console delivers Ctrl+C to the whole process group, so the
  launcher absorbs `SIGINT`/`SIGBREAK` instead of forwarding them, and stays
  alive until the child exits so the proxy is always closed.

Why prompt caching is pinned to the provider default:

- Meta rejects `cache_control.ttl: 1h` with HTTP 400. Claude Code requests the
  1-hour cache when it believes it is signed in to a Claude subscription, which
  it does here because the shared `~/.claude` is preserved by design. Which
  provider the request goes to plays no part in that decision.
- The extended cache is limited to a few request scopes: the main interactive
  thread is one of them, a one-shot `-p` run is not. So an installation that was
  only ever checked with `-p` passes every test and then fails on the user's
  first interactive session. Do not treat a green `-p` smoke test as proof here.
- `FORCE_PROMPT_CACHING_5M=1` is therefore set for the child. It is the first
  condition Claude Code evaluates and overrides environment variables, settings
  and agent frontmatter alike.
- The adapter additionally reduces every `cache_control` object to
  `{"type":"ephemeral"}` before the request leaves the machine, dropping the
  `ttl` and `scope` extensions whatever the client decided. Ordinary prompt
  caching keeps working; only the Anthropic-specific variants are given up.

Why the context and effort settings are exact:

- Muse Spark 1.3 has a 1,048,576-token context window. Claude Code otherwise
  assumes 200,000 for this unknown model ID. With many MCP schemas, startup can
  consume roughly 120,000 tokens and cause AutoCompact around 172,000, followed
  by compaction thrashing. `CLAUDE_CODE_MAX_CONTEXT_TOKENS=1048576` fixes the
  assumed window for this non-`claude-` ID while proactive AutoCompact remains
  enabled. Do not set `DISABLE_COMPACT`.
- Muse supports `minimal`, `low`, `medium`, and `high`. It accepts `xhigh`, but
  maps it to the same reasoning strength as `high`; `high` is the effective
  maximum. Claude Code does not expose `minimal`, so advertise only `effort`
  without `xhigh_effort` or `max_effort`.
- Default to `high` using the CLI argument injected by `claudeArgs()`. Do not set
  `CLAUDE_CODE_EFFORT_LEVEL`, because that environment variable overrides both
  `--effort` and the in-session `/effort` command. A user-supplied
  `claude-muse --effort low|medium|high` must take precedence, and `/effort` must
  remain able to change the active session.
- Map the main model, Fable, Opus, Sonnet, Haiku, and subagents to the Contributor
  model ID so an internal Claude Code role never sends a `claude-*` model ID to
  Meta.

After writing the files, run the offline checks for your platform and fix any
failure before continuing.

On POSIX:

```bash
bash -n "$HOME/.local/bin/claude-muse"
node --check "$HOME/.local/lib/claude-muse/launcher.cjs"
node --check "$HOME/.local/lib/claude-muse/adapter.cjs"
node --test "$HOME/.local/lib/claude-muse/launcher.test.cjs" \
  "$HOME/.local/lib/claude-muse/adapter.test.cjs"
stat -c '%a %n' "$HOME/.local/bin/claude-muse" \
  "$HOME/.config/claude-muse" \
  "$HOME/.config/claude-muse/provider.env" 2>/dev/null || \
stat -f '%Lp %N' "$HOME/.local/bin/claude-muse" \
  "$HOME/.config/claude-muse" \
  "$HOME/.config/claude-muse/provider.env"
```

Expected permissions are `700` for the launcher and config directory, and `600`
for `provider.env`.

On native Windows:

```powershell
$lib = Join-Path $env:USERPROFILE '.local\lib\claude-muse'
node --check (Join-Path $lib 'launcher.cjs')
node --check (Join-Path $lib 'adapter.cjs')
node --test (Join-Path $lib 'launcher.test.cjs') (Join-Path $lib 'adapter.test.cjs')
Get-Content (Join-Path $env:USERPROFILE '.local\bin\claude-muse.cmd')
icacls (Join-Path $env:USERPROFILE '.config\claude-muse\provider.env')
```

The `icacls` output is informational only. Do not change it. Report what it
shows, and restate that the key file is protected only by the user profile's
inherited rights.

There are forty-two offline tests in total: twenty-five in `adapter.test.cjs`
and seventeen in `launcher.test.cjs`. All forty-two must pass on both platforms;
six of them exercise the Windows program-resolution logic against realistic npm
shims and run correctly on POSIX as well. Report the count you actually observed.

Then confirm that `claude-muse` resolves as a command in a freshly started
terminal. If a startup file or the user `Path` was changed, explain how to
reload it or open a new terminal.

If the key is still empty, stop here and ask me to edit it locally.

On POSIX:

```bash
${EDITOR:-nano} "$HOME/.config/claude-muse/provider.env"
```

On Windows:

```powershell
notepad (Join-Path $env:USERPROFILE '.config\claude-muse\provider.env')
```

Tell me to place the key between the single quotes on `MUSE_AUTH_TOKEN=''`, save
the file, and reply only that the key has been added. Do not ask for the key
itself. Continue verification after I confirm. If the file is saved from Notepad
it may gain a byte-order mark and CRLF line endings; the launcher tolerates
both, so do not ask me to convert the file.

Once a non-empty key is present, remind me of the Contributor data-use condition
and perform a small direct API smoke test against:

```text
POST https://api.meta.ai/v1/messages
model: muse-spark-1.3-contributor
```

Use `Authorization: Bearer`, `anthropic-version: 2023-06-01`, and a tiny prompt.
Do not use `set -x`, verbose HTTP output, shell interpolation that exposes the
token, or print request headers. On Windows, do not use `curl.exe -v` or
`Invoke-WebRequest -Debug` for the same reason. Report only HTTP status,
returned model ID, answer presence, and token usage. Handle these errors
explicitly:

- `401`: invalid or unavailable key.
- `402`: billing verification failed; ask me to finish payment setup in Meta
  Model API and retry later.
- `404`: confirm that Claude Code uses base URL `https://api.meta.ai`, while a
  direct Messages request uses `https://api.meta.ai/v1/messages`.
- `400` mentioning a tool name over 64 characters: verify that Claude Code is
  running through the local adapter and that the alias transformation covers
  the named block.
- `400` naming any other unsupported field: rerun with `--muse-debug` and read
  the `upstream_error` line in the log. It names the field.
- Claude Code reporting the model as temporarily unavailable while read-only
  tools keep working: that is auto mode's classifier failing, not an outage.
  Check the log before believing the message.
- `claude-muse` refusing to start over `MUSE_BASE_URL`: the URL is malformed, is
  not http or https, or carries credentials. Fix `provider.env` and run again;
  the message names the setting and the file, and quotes neither the value nor
  anything in it.

Then run a cheap Claude Code smoke test with no customizations or tools.

On POSIX:

```bash
claude-muse -p 'Reply with exactly: MUSE WORKS' \
  --safe-mode --setting-sources '' --strict-mcp-config --tools '' \
  --no-session-persistence --output-format json
```

On Windows, in PowerShell. The two empty values are written `'""'`, not `''`,
and that is not a typo: `claude-muse` is a `.cmd` shim, so PowerShell passes the
arguments to it the legacy way and drops every empty string on the floor.
`--setting-sources ''` arrives as a bare `--setting-sources` that then eats the
next flag as its value, and the smoke test quietly stops testing what it says it
tests. `'""'` reaches the shim as a quoted empty argument and Node receives the
empty string. (`--%` would also work, but it ends at the line break, and this
command does not fit on one line.)

```powershell
claude-muse -p 'Reply with exactly: MUSE WORKS' `
  --safe-mode --setting-sources '""' --strict-mcp-config --tools '""' `
  --no-session-persistence --output-format json
```

Parse the JSON without printing hidden reasoning. Verify all of the following:

- `is_error` is false.
- Result is `MUSE WORKS`.
- Model usage contains `muse-spark-1.3-contributor`.
- Reported context window is `1048576`, not `200000`.
- `FORCE_PROMPT_CACHING_5M` is `1` in the child environment.

Test both effort paths with tiny prompts: a default launch must complete at the
configured `high`; `claude-muse --effort low` must complete without the default
overriding it. Do not claim exact reasoning-token counts, because generation is
nondeterministic. Confirm that `CLAUDE_CODE_EFFORT_LEVEL` and `MUSE_AUTH_TOKEN`
are both absent from the child environment, and explain that `/effort low`,
`/effort medium`, and `/effort high` are available after starting a fresh
interactive session.

Check web search with one live call, because it is the only path that exercises
a Meta server-side tool:

```text
claude-muse -p 'Use WebSearch to find the current stable Node.js version. Cite the URL.' \
  --allowedTools WebSearch --no-session-persistence --output-format json
```

`is_error` must be false and the answer must carry a source URL. A 400 reading
"web_search field max_uses is not supported" here means the adapter is not
normalising the tool definition; fix that before continuing. Note that Meta does
not report `server_tool_use` counters back, so `web_search_requests` stays `0` in
the JSON result even when the search ran — judge by the answer, not the counter.

Finally, run a temporary-directory integration test that allows only Read, Grep,
Bash, Edit, and Agent. Have Muse read a small fixture, grep one marker, run a
working-directory command, edit one line, and ask a general-purpose subagent to
calculate `37+5`. Use `--no-session-persistence`; do not test against a real
repository. Clean up only the exact temporary directory created for this test.

On every platform, confirm by hand that an interactive `claude-muse` session
starts, sends one real message and gets an answer. A `-p` run does not exercise
the same prompt-cache path, so it cannot prove the session will work. It also
sends a different set of tools: the Artifact tool is absent from a print-mode
run, so a tool schema the provider refuses can end every interactive turn while
every `-p` check above stays green. Run one more print-mode check with that
tool forced in, and require the same answer. On POSIX:

```text
CLAUDE_CODE_ARTIFACT=1 claude-muse -p 'Reply with exactly: MUSE WORKS' \
  --no-session-persistence --output-format json
```

On Windows, in PowerShell:

```powershell
$env:CLAUDE_CODE_ARTIFACT = '1'
claude-muse -p 'Reply with exactly: MUSE WORKS' `
  --no-session-persistence --output-format json
Remove-Item Env:\CLAUDE_CODE_ARTIFACT
```

A 400 reading `Invalid JSON schema` and quoting a regular expression here means
the adapter is not stripping the patterns Meta cannot compile; fix that rather
than pinning or downgrading Claude Code, which only moves the failure to the
next release.

This check can also pass while testing nothing, and saying which happened is
part of reporting it. The schema that breaks is behind a server-side feature
gate: on a machine outside that rollout the tool is still sent, but without the
argument carrying the bad pattern, so the check goes green without ever
exercising it. There is no way to force the gate on from the outside. Report
which case this machine is in:

```text
node -p "require(require('os').homedir()+'/.claude.json').cachedGrowthBookFeatures.tengu_umber_stile"
```

`true` means the check exercised the schema. Anything else means it did not,
and that this machine will begin to whenever the gate reaches it - with no
update, and no warning. On native
Windows this also confirms that the terminal interface renders through the
`.cmd` shim, accepts a keystroke, and exits cleanly with `/exit`. Automated `-p` runs do not prove that the terminal
interface works through the `.cmd` shim. If Ctrl+C during a non-interactive run
produces `Terminate batch job (Y/N)?`, report it as an observed limitation of
the shim rather than a failure of the adapter.

If the target machine has installed MCP tools whose fully qualified names exceed
64 characters, run a focused integration check using one harmless tool. Confirm
that Claude Code receives the original long name and the request reaches the MCP
server without Meta's 64-character HTTP 400. A browser display/X-server failure,
MCP authentication failure, or tool-specific validation error is separate from
the aliasing test; report it accurately and do not change unrelated MCP config.

At completion, report:

- the detected platform, and which files were written for it;
- under Git Bash or another MSYS shell, whether `$HOME` and `os.homedir()`
  agreed, and which home directory the installation used;
- paths and, on POSIX, permissions created;
- on Windows, how Claude Code was located (`claude.exe` or npm shim) and the
  explicit statement that `provider.env` is protected only by inherited profile
  rights;
- Claude Code, Node.js, and platform versions;
- direct Meta API result without secret material;
- model ID, context window, default effort, and supported `/effort` choices;
- offline test count, the web-search live check, and integration-test results;
- any untested limitation;
- the commands `claude-muse` and `claude-muse --continue`.

Do not claim success until the offline tests and live smoke tests have actually
passed. Never include the API key in your final response.
