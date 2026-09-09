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

```bash
# Add the Meta Model API key between single quotes. Never share this file.
MUSE_AUTH_TOKEN=''

# The host on its own. A key never belongs in this URL - the HTTP client refuses
# a URL that carries credentials, so `https://user:key@host` fails every request
# rather than some of them. The launcher refuses it at startup and says so.
MUSE_BASE_URL='https://api.meta.ai'
MUSE_MODEL='muse-spark-1.3-contributor'

# Muse has a 1,048,576-token window; automatic compaction remains enabled.
MUSE_MAX_CONTEXT_TOKENS='1048576'
MUSE_EFFORT='high'

# Seconds of complete silence before the adapter gives up on a request. This is
# an idle timer: any byte in either direction restarts it, so a long streaming
# turn is never cut off. Raise it only if a stalled connection should be held
# open longer.
MUSE_IDLE_TIMEOUT_SECONDS='300'
```

Do not enforce a particular textual format for the Meta key. Meta keys have
appeared in both pipe-delimited and underscore-delimited forms; non-empty is the
only launcher-side validation needed. The launcher reads this file as data and
never executes it, so shell metacharacters inside the key are inert.

On POSIX, create `~/.local/bin/claude-muse` with mode `700` and this exact
content:

```bash
#!/usr/bin/env bash

set -Eeuo pipefail

exec node "$HOME/.local/lib/claude-muse/launcher.cjs" "$@"
```

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

```bat
@ECHO off
SETLOCAL
endLocal & goto #_undefined_# 2>NUL || title %COMSPEC% & node "%USERPROFILE%\.local\lib\claude-muse\launcher.cjs" %*
```

Create `~/.local/lib/claude-muse/launcher.cjs` with this exact content. This
file is identical on every platform; it decides what to do from
`process.platform` at run time.

```javascript
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const { spawn } = require('node:child_process');
const { startProxy } = require('./adapter.cjs');

const WINDOWS = process.platform === 'win32';
const ENV_FILE = path.join(os.homedir(), '.config', 'claude-muse', 'provider.env');
const PLACEHOLDER = 'LLM|YOUR_NUMERIC_ID|YOUR_SECRET';

const DEFAULTS = {
  MUSE_MODEL: 'muse-spark-1.3-contributor',
  MUSE_EFFORT: 'high',
  MUSE_MAX_CONTEXT_TOKENS: '1048576',
  MUSE_CAPABILITIES: 'effort,thinking,adaptive_thinking,interleaved_thinking',
  MUSE_IDLE_TIMEOUT_SECONDS: '300',
};

// Provider and experimental overrides that must not reach Claude Code.
const SCRUB = [
  'ANTHROPIC_API_KEY', 'ANTHROPIC_CUSTOM_HEADERS', 'CLAUDE_CONFIG_DIR',
  'CLAUDE_CODE_USE_BEDROCK', 'CLAUDE_CODE_USE_VERTEX', 'CLAUDE_CODE_USE_FOUNDRY',
  'DISABLE_COMPACT', 'DISABLE_AUTO_COMPACT', 'CLAUDE_CODE_MAX_CONTEXT_TOKENS',
  'CLAUDE_CODE_AUTO_COMPACT_WINDOW', 'CLAUDE_CODE_DISABLE_1M_CONTEXT',
  'CLAUDE_CODE_DISABLE_UNKNOWN_MODEL_WINDOW_ENFORCEMENT',
  'CLAUDE_CODE_EFFORT_LEVEL', 'MAX_THINKING_TOKENS',
  'CLAUDE_CODE_DISABLE_THINKING', 'CLAUDE_CODE_DISABLE_ADAPTIVE_THINKING',
  'ANTHROPIC_CUSTOM_MODEL_OPTION', 'ANTHROPIC_CUSTOM_MODEL_OPTION_NAME',
  'ANTHROPIC_CUSTOM_MODEL_OPTION_DESCRIPTION',
  'ANTHROPIC_CUSTOM_MODEL_OPTION_SUPPORTED_CAPABILITIES',
  'ANTHROPIC_DEFAULT_FABLE_MODEL_SUPPORTED_CAPABILITIES',
  'ANTHROPIC_DEFAULT_OPUS_MODEL_SUPPORTED_CAPABILITIES',
  'ANTHROPIC_DEFAULT_SONNET_MODEL_SUPPORTED_CAPABILITIES',
  'ANTHROPIC_DEFAULT_HAIKU_MODEL_SUPPORTED_CAPABILITIES',
  'MUSE_AUTH_TOKEN',
];

// Reads provider.env as data. Tolerates a UTF-8 BOM and CRLF, which Windows
// editors add, and never executes the file the way `source` used to.
function parseEnvFile(text) {
  const config = {};
  for (const line of text.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    let entry = line.trim();
    if (!entry || entry.startsWith('#')) continue;
    if (entry.startsWith('export ')) entry = entry.slice(7).trim();
    const split = entry.indexOf('=');
    if (split < 1) continue;
    const key = entry.slice(0, split).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    let value = entry.slice(split + 1).trim();
    // A quoted value ends at its closing quote, and whatever follows is a
    // comment; the quotes have to come off either way. Testing that the value
    // *ends* with the quote instead would miss `'https://api.meta.ai' # note`
    // and hand the launcher a URL with quote marks in it. Inside the quotes a
    // `#` is part of the value, so the comment is found only after they are
    // matched, never before. An unterminated quote is left exactly as written
    // rather than guessed at.
    const quote = value[0];
    if (quote === "'" || quote === '"') {
      const close = value.indexOf(quote, 1);
      if (close > 0) value = value.slice(1, close);
    } else if (value.includes(' #')) {
      value = value.slice(0, value.indexOf(' #')).trim();
    }
    config[key] = value;
  }
  return config;
}

// Checked at load, not at the first request. `fetch` refuses a URL that carries
// credentials outright - it throws before a packet moves - so a base URL written
// as `https://user:password@host` fails every request this launcher will ever
// make, and each one arrives as a 502 from a proxy that looks broken. It is a
// configuration mistake, and this is where configuration mistakes are named.
//
// None of these messages quote the value. A URL that is malformed can still
// carry a password, and a sentence printed to the terminal is a sentence that
// gets pasted into a bug report. The setting and the file locate it precisely
// enough for someone who wrote it.
function checkBaseUrl(value, file) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('MUSE_BASE_URL in ' + file + ' is not a URL.');
  }
  if (url.username || url.password) {
    throw new Error(
      'MUSE_BASE_URL in ' + file + ' carries credentials in the URL, which the HTTP\n' +
      '  client refuses - every request would fail. Write the host on its own and put\n' +
      '  the key in MUSE_AUTH_TOKEN, which is the header this adapter sets.'
    );
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('MUSE_BASE_URL in ' + file + ' must be an http or https URL.');
  }
}

function loadConfig(file = ENV_FILE, read = fs.readFileSync) {
  let text;
  try {
    text = read(file, 'utf8');
  } catch {
    throw new Error('configuration not found: ' + file);
  }
  const config = { ...DEFAULTS, ...parseEnvFile(text) };
  for (const [key, fallback] of Object.entries(DEFAULTS)) if (!config[key]) config[key] = fallback;
  if (!config.MUSE_AUTH_TOKEN || config.MUSE_AUTH_TOKEN === PLACEHOLDER) {
    throw new Error('set MUSE_AUTH_TOKEN in ' + file + ' before launching.');
  }
  if (!config.MUSE_BASE_URL) throw new Error('MUSE_BASE_URL is not set in ' + file);
  // After the token check, which owns the placeholder case: a fresh install has
  // both unset, and "set your key" is the sentence that moves that user forward.
  checkBaseUrl(config.MUSE_BASE_URL, file);
  return config;
}

// Windows environment names are case-insensitive, so a stray `Anthropic_Api_Key`
// has to go too. On POSIX an exact match is the only correct match.
function scrubEnv(source, windows = WINDOWS) {
  const env = { ...source };
  if (!windows) {
    for (const name of SCRUB) delete env[name];
    return env;
  }
  const drop = new Set(SCRUB.map(name => name.toLowerCase()));
  for (const key of Object.keys(env)) if (drop.has(key.toLowerCase())) delete env[key];
  return env;
}

function buildChildEnv(source, config, windows = WINDOWS) {
  const env = scrubEnv(source, windows);
  const model = config.MUSE_MODEL;
  const capabilities = config.MUSE_CAPABILITIES;
  return Object.assign(env, {
    ANTHROPIC_MODEL: model,
    ANTHROPIC_DEFAULT_FABLE_MODEL: model,
    ANTHROPIC_DEFAULT_OPUS_MODEL: model,
    ANTHROPIC_DEFAULT_SONNET_MODEL: model,
    ANTHROPIC_DEFAULT_HAIKU_MODEL: model,
    CLAUDE_CODE_SUBAGENT_MODEL: model,
    ANTHROPIC_CUSTOM_MODEL_OPTION: model,
    ANTHROPIC_CUSTOM_MODEL_OPTION_NAME: 'Muse Spark 1.3 Contributor',
    ANTHROPIC_CUSTOM_MODEL_OPTION_SUPPORTED_CAPABILITIES: capabilities,
    ANTHROPIC_DEFAULT_FABLE_MODEL_SUPPORTED_CAPABILITIES: capabilities,
    ANTHROPIC_DEFAULT_OPUS_MODEL_SUPPORTED_CAPABILITIES: capabilities,
    ANTHROPIC_DEFAULT_SONNET_MODEL_SUPPORTED_CAPABILITIES: capabilities,
    ANTHROPIC_DEFAULT_HAIKU_MODEL_SUPPORTED_CAPABILITIES: capabilities,
    CLAUDE_CODE_MAX_CONTEXT_TOKENS: config.MUSE_MAX_CONTEXT_TOKENS,
    ENABLE_TOOL_SEARCH: 'false',
    // Meta rejects `cache_control.ttl: 1h`. A Claude subscription in the shared
    // ~/.claude makes Claude Code ask for the 1-hour cache in interactive
    // sessions, so pin the provider default; this beats every other source.
    FORCE_PROMPT_CACHING_5M: '1',
  });
}

// `--muse-debug` turns the adapter's request log on for one run, and
// `--muse-debug=<path>` says where to write it. The value is joined to the flag
// rather than taken as the argument after it, because
// `claude-muse --muse-debug "write a test"` would otherwise swallow the prompt
// as a filename.
//
// The flag is namespaced instead of a plain `--debug`: Claude Code has one of
// its own, and taking that name here would remove a flag from the program this
// launcher exists to run. Only this flag is removed; everything else passes
// through in the order it was given.
//
// The generated name carries random bytes as well as the time. The default
// lands in a directory every account on the machine can write to, and a name
// that is only a timestamp is a name another account can predict and leave a
// symlink under - which is how a diagnostic log ends up appended to somebody
// else's file. Timestamp for a human reading `ls`, randomness for everything
// else.
function debugTarget(args, dir = os.tmpdir(), now = Date.now(), nonce = randomBytes(6).toString('hex')) {
  const at = args.findIndex(arg => arg === '--muse-debug' || arg.startsWith('--muse-debug='));
  if (at === -1) return { args, log: null, chosen: false };
  const chosen = args[at].slice('--muse-debug='.length);
  return {
    args: [...args.slice(0, at), ...args.slice(at + 1)],
    log: chosen || path.join(dir, 'claude-muse-' + now + '-' + nonce + '.log'),
    chosen: Boolean(chosen),
  };
}

// A log the user asked for and did not get is worse than never having offered
// the flag: the path is announced, the failure is reproduced, and the file that
// was meant to explain it is empty or missing. `--muse-debug=<path>` can name a
// destination this process cannot write - a directory that does not exist, one
// it has no rights to - and every append in the adapter is deliberately silent,
// because a diagnostic must never break the turn it exists to explain.
//
// So the destination is opened once here instead, and a path that cannot be
// written stops the run. The run about to start is the one the user wanted
// recorded; starting it blind wastes the reproduction, which is the expensive
// part.
//
// Created private, and created exclusively when this program invented the name.
// The log holds the shape of every request and the text of every refusal, and
// the default sits in a directory shared with every other account on the
// machine, where `022` would otherwise publish it as `0644`. `0600` applies
// only to a file this call creates; a path the user already owns keeps the
// rights they gave it.
//
// `ax` for a generated name, so one already waiting under it - a symlink into
// another file - is refused instead of appended to. `a` for a path the user
// named, because appending to a log they already have is the point of naming
// one.
function openDebugLog(target, chosen = false, open = fs.openSync, close = fs.closeSync) {
  try {
    close(open(target, chosen ? 'a' : 'ax', 0o600));
  } catch (error) {
    throw new Error(
      'cannot write the debug log to ' + target + ': ' + ((error && error.code) || (error && error.message)) + '\n' +
      '  --muse-debug=<path> needs a path in a directory that exists and is writable,\n' +
      '  and a generated log name must not already exist.'
    );
  }
}

function claudeArgs(args, defaultEffort) {
  if (args.some(arg => arg === '--effort' || arg.startsWith('--effort='))) return args;
  return ['--effort', defaultEffort, ...args];
}

// First match wins, in PATH order, the way the shell resolves a command.
function findOnPath(names, pathValue = process.env.PATH || '') {
  for (const raw of pathValue.split(path.delimiter)) {
    const dir = raw.replace(/^"|"$/g, '').trim();
    if (!dir) continue;
    for (const name of names) {
      const candidate = path.join(dir, name);
      try { if (fs.statSync(candidate).isFile()) return candidate; } catch { /* keep looking */ }
    }
  }
  return null;
}

// npm writes these shims on Windows. The expressions below are the ones npm's
// own read-cmd-shim uses to read them back, so they match what cmd-shim wrote.
const SHIM_TARGET = {
  '.cmd': /"%(?:~dp0|dp0%)\\([^"]+?)"\s+%[*]/,
  '.ps1': /"[$]basedir[/]([^"]+?)"\s+[$]args/,
};

function targetFromShim(shim) {
  const pattern = SHIM_TARGET[path.extname(shim).toLowerCase()];
  if (!pattern) return null;
  let text;
  try { text = fs.readFileSync(shim, 'utf8'); } catch { return null; }
  const found = text.match(pattern);
  if (!found) return null;
  const target = path.resolve(path.dirname(shim), found[1].replace(/[\\/]+/g, path.sep));
  try { return fs.statSync(target).isFile() ? target : null; } catch { return null; }
}

// The four forms `claude` can take on Windows, ordered the way the shell orders
// them: by `PATHEXT`. A user who puts `.CMD` before `.EXE` there has told the
// system which one wins in a directory holding both, and this has to agree or
// the launcher starts an installation the user's own `claude` does not.
// Anything `PATHEXT` does not mention goes last, in the conventional order —
// `.PS1` is never in it, since PowerShell resolves its own scripts, and a
// truncated `PATHEXT` should not make an installed Claude invisible.
const CLAUDE_FORMS = ['.COM', '.EXE', '.CMD', '.PS1'];

function claudeNames(pathext = process.env.PATHEXT) {
  const listed = String(pathext || '').split(';').map(entry => entry.trim().toUpperCase());
  const ordered = listed.filter(entry => CLAUDE_FORMS.includes(entry));
  for (const form of CLAUDE_FORMS) if (!ordered.includes(form)) ordered.push(form);
  return ordered.map(form => 'claude' + form.toLowerCase());
}

// POSIX resolves `claude` itself. Windows needs the real program, because
// child_process cannot execute a .cmd shim without a shell. Claude Code ships a
// native binary, so its shim normally points at claude.exe rather than at a .js
// entry point; both shapes are handled, and neither goes through cmd.exe.
function resolveClaude(windows = WINDOWS, pathValue = process.env.PATH || '', pathext = process.env.PATHEXT) {
  if (!windows) return { file: 'claude', prefix: [] };
  // One pass over PATH, in PATHEXT order inside each directory, because that is
  // how the shell picks: the first directory holding any of these wins, so a
  // claude.cmd early on PATH beats a claude.exe later on it. Scanning for every
  // executable first and only then for shims would quietly run a different
  // installation from the one the user's own `claude` runs — and the one whose
  // version this install just checked.
  const found = findOnPath(claudeNames(pathext), pathValue);
  if (!found) return null;
  if (/\.(com|exe)$/i.test(found)) return { file: found, prefix: [] };
  const target = targetFromShim(found);
  if (!target) return null;
  return /\.[cm]?js$/i.test(target)
    ? { file: process.execPath, prefix: [target] }
    : { file: target, prefix: [] };
}

// The status this process exits with once the child is gone. A child killed by
// a signal has no exit code, and the shell convention for that is 128 plus the
// signal number — 130 for SIGINT, 137 for a SIGKILL from the OOM killer, 143 for
// SIGTERM. Reporting one fixed number instead would tell every caller the run
// was terminated politely, whatever actually happened to it.
function exitStatus(code, signal) {
  if (code !== null && code !== undefined) return code;
  const number = os.constants.signals[signal];
  return number ? 128 + number : 143;
}

// How the child is started. Never `detached`, on any platform: the child stays
// in this process group, inside the job the shell controls.
//
// Detaching it is tempting, because then the terminal signals this process
// alone and every signal can be forwarded without asking who sent it. The
// price is job control, all of it. A detached child's process group is orphaned
// by definition — its only parent is in another session — and POSIX discards
// stop signals sent to an orphaned group, so Ctrl+Z stops the launcher and
// leaves Claude Code running. Emulating that with SIGSTOP works, but the shell
// sends the same SIGCONT for `bg` as for `fg`, and nothing distinguishes them,
// so `bg` resumes a child that then fights the shell for the terminal — while
// SIGTTIN and SIGTTOU, the protection that normally prevents exactly this, do
// not apply to a process outside the terminal's session.
//
// In this group instead, the kernel does all of it correctly and for free:
// Ctrl+Z stops both, `fg` and `bg` behave, Ctrl+\ takes both down, and a resize
// reaches the child directly. What that costs is knowing who sent a SIGINT,
// which is what signalPlan below is about.
function spawnOptions() {
  return { stdio: 'inherit' };
}

// Whether this process has a controlling terminal, which is the only thing that
// decides whether a terminal-generated signal reaches its process group. Opening
// `/dev/tty` succeeds exactly when it does and fails with ENXIO when it does
// not. This is the whole test: `isTTY` on the standard streams answers a
// different question and is wrong in both directions. All three streams can be
// redirected while the process sits in the terminal's foreground group and still
// gets Ctrl+C (`claude-muse -p x </dev/null >out 2>err`), and all three can be
// pty descriptors in a process that has no controlling terminal at all, which is
// what `setsid` with inherited descriptors produces.
function hasControllingTerminal(ttyPath = '/dev/tty') {
  try {
    fs.closeSync(fs.openSync(ttyPath, 'r'));
    return true;
  } catch {
    return false;
  }
}

// Which signals this process absorbs and which it passes on. Only the two the
// terminal can generate are in question; everything else the kernel already
// delivers to the whole group, which is where the child is.
//
// With a terminal attached, Ctrl+C and a hangup have reached the child already.
// Forwarding would hand Claude Code a second copy, and it reads a second SIGINT
// as "force quit", so one Ctrl+C would cancel twice. They are absorbed instead,
// which also keeps this process alive to close the proxy after the child exits.
//
// With no controlling terminal — a supervisor, a CI step, a script, anything
// started under `setsid` — nothing can be generating them for the group, so a
// signal that arrives was aimed at this pid alone and the child has not seen it.
// Absorbing there would leave a cancelled run running, so they are forwarded.
//
// What stays undecidable is a supervisor that keeps this process in a terminal's
// session and signals by pid: that reads as the terminal case and is absorbed.
// Nothing in Node says who sent a signal. SIGTERM is never terminal-generated
// and is always forwarded, which is why it is the documented way to cancel a run
// by pid.
function signalPlan(platform = process.platform, terminal = hasControllingTerminal()) {
  if (platform === 'win32') return { absorb: ['SIGINT', 'SIGBREAK'], forward: [] };
  return terminal
    ? { absorb: ['SIGINT', 'SIGHUP'], forward: ['SIGTERM'] }
    : { absorb: [], forward: ['SIGINT', 'SIGHUP', 'SIGTERM'] };
}

async function main() {
  // Read here, acted on twice. The destination has to be opened before the
  // proxy is listening: `main`'s catch only sets an exit code, so a throw past
  // that point would leave the process alive on an open server. Publishing the
  // path to the environment has to wait until after the child environment is
  // built, further down, or Claude Code inherits it.
  const debug = debugTarget(process.argv.slice(2));
  if (debug.log) openDebugLog(debug.log, debug.chosen);
  const config = loadConfig();
  const target = resolveClaude();
  if (!target) {
    throw new Error(
      'could not find the Claude Code program.\n' +
      '  Looked for claude.exe or claude.com on PATH, then read the npm shim\n' +
      '  (claude.cmd or claude.ps1) to find the program behind it.\n' +
      '  Install Claude Code so one of those exists, then run claude-muse again.'
    );
  }
  const proxy = await startProxy(config.MUSE_BASE_URL, config.MUSE_AUTH_TOKEN, config.MUSE_IDLE_TIMEOUT_SECONDS);
  // Everything past this point runs with a socket already listening, and this
  // function's only caller turns a rejection into an exit code. A throw that
  // left the server open would hold the event loop and hang the terminal
  // instead of reporting the fault - which is why the debug destination is
  // opened at the top of this function, where there is nothing yet to close.
  // Closing here for anything that throws anyway makes that ordering a
  // preference rather than the only thing standing between a mistyped path and
  // a process that never exits.
  try {
    const env = buildChildEnv(process.env, config);
    env.ANTHROPIC_BASE_URL = proxy.url;
    env.ANTHROPIC_AUTH_TOKEN = proxy.token;
    // Published after the child environment is built, so the log stays a property
    // of this process and Claude Code does not inherit it. The path was already
    // opened, so this announces a file that exists.
    if (debug.log) {
      process.env.MUSE_DEBUG_LOG = debug.log;
      console.error('claude-muse: request log -> ' + debug.log);
    }
    const args = [...target.prefix, ...claudeArgs(debug.args, config.MUSE_EFFORT)];
    const child = spawn(target.file, args, { env, ...spawnOptions() });

    let finished = false;
    const finish = code => {
      if (finished) return;
      finished = true;
      proxy.server.closeAllConnections();
      proxy.server.close();
      process.exitCode = code;
    };
    child.on('error', () => { console.error('Unable to start Claude Code.'); finish(1); });
    child.on('exit', (code, signal) => finish(exitStatus(code, signal)));
    const plan = signalPlan();
    for (const signal of plan.absorb) process.on(signal, () => {});
    for (const signal of plan.forward) process.on(signal, () => child.kill(signal));
  } catch (error) {
    proxy.server.closeAllConnections();
    proxy.server.close();
    throw error;
  }
}

module.exports = {
  parseEnvFile, loadConfig, checkBaseUrl, scrubEnv, buildChildEnv, claudeArgs, debugTarget, openDebugLog,
  findOnPath, targetFromShim, resolveClaude, claudeNames, spawnOptions, signalPlan,
  hasControllingTerminal, exitStatus, SCRUB, DEFAULTS,
};

if (require.main === module) {
  main().catch(error => {
    console.error('Error: ' + (error && error.message ? error.message : 'claude-muse could not start.'));
    process.exitCode = 1;
  });
}
```

Create `~/.local/lib/claude-muse/adapter.cjs` with this exact content:

```javascript
const http = require('node:http');
const { createHash, randomBytes } = require('node:crypto');
const { once } = require('node:events');
const fs = require('node:fs');

// Diagnostics, off unless MUSE_DEBUG_LOG names a file.
//
// Meta rejects request fields this adapter has not learned about yet, one at a
// time, and Claude Code reports every one of them the same way: "the model is
// temporarily unavailable" - a sentence that names neither the request nor the
// field. Without a record there is nothing to tell that apart from a network
// failure, an idle timeout, or a fault in this file. This log is how the next
// unsupported field gets identified instead of guessed at.
//
// It records the shape of a request and what a failing reply declared about
// itself. Never a header, never the credential, never the content of a message
// - `parseJson` and `errorSummary` below are what hold that line where a body
// this file did not write passes through. The path is read on each call, so
// setting it after this file is loaded still works.
let reportedFault = null;

function debugLog(entry) {
  const target = process.env.MUSE_DEBUG_LOG;
  if (!target) return;
  try {
    // The launcher opens its own target `0600`, but `MUSE_DEBUG_LOG` set in the
    // environment never passes through it. Applied only when this call creates
    // the file.
    fs.appendFileSync(target, JSON.stringify({ ts: new Date().toISOString(), ...entry }) + '\n', { mode: 0o600 });
  } catch (error) {
    // Never thrown: a diagnostic that breaks the turn it was meant to explain
    // is worse than no diagnostic at all. Never silent either - a user told the
    // log is being written, who then finds nothing in it, has been sent to look
    // in the wrong place for the rest of the session.
    //
    // Said once per destination, not once per request: this runs three times a
    // turn, and a full disk would otherwise bury the failure it is reporting.
    // Writing is still attempted afterwards, because the entry worth having is
    // usually the one that has not happened yet, and the condition may lift.
    if (reportedFault !== target) {
      reportedFault = target;
      console.error(
        'claude-muse: cannot write the request log to ' + target + ': ' +
        ((error && error.code) || (error && error.message)) +
        ' (further failures on this path are not reported)'
      );
    }
  }
}

// `JSON.parse` quotes a window of its input in the error it throws, and every
// body parsed here is the content of a turn: a request on its way out, a reply
// on its way back. Left alone, one malformed body puts a fragment of a message
// into the log through `adapter_error` - the single thing the log promises
// never to hold. Every parse goes through here instead, so a bad body is
// reported by name and never by excerpt.
function parseJson(text, what) {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(what + ' is not valid JSON');
  }
}

// A provider's refusal is the whole reason this log exists - it is where
// `stop_sequences` was named - but the body carrying that sentence is written
// upstream, and nothing constrains what it repeats back. A 4xx that quotes the
// request it objected to, or echoes the authorization it just rejected, would
// put exactly what this log promises never to write straight into it.
//
// So the body is never copied. Only the fields an error declares about itself
// are lifted out, capped, and scrubbed of every credential this process holds;
// a body shaped like anything else is recorded by size alone. That is enough to
// name an unsupported field, which is what the log is for, and it holds whatever
// the provider decides to say.
const ERROR_MESSAGE_LIMIT = 300;

function errorSummary(payload, secrets = []) {
  const text = Buffer.isBuffer(payload) ? payload.toString('utf8') : String(payload == null ? '' : payload);
  const summary = { bytes: Buffer.isBuffer(payload) ? payload.length : Buffer.byteLength(text, 'utf8') };
  let parsed;
  try { parsed = JSON.parse(text); } catch { parsed = undefined; }
  // Both shapes are in the wild: `{"error":{...}}` from an Anthropic-compatible
  // endpoint, and a bare `{"type":...,"message":...}` from a gateway standing in
  // front of one.
  const declared = parsed && typeof parsed === 'object' && parsed.error && typeof parsed.error === 'object'
    ? parsed.error
    : parsed;
  const field = name => (declared && typeof declared === 'object' && typeof declared[name] === 'string' ? declared[name] : undefined);
  const type = field('type') || field('code');
  const message = field('message');
  // Redacted first, capped second, and never the other way round. A credential
  // lying across the cap loses its tail to the cut, so the exact-match search
  // that removes it finds nothing and its head survives into the log - the cap
  // would be what defeated the redaction. Both fields are capped: each is a
  // string the provider chooses, and neither belongs in a log without a bound.
  if (type !== undefined) summary.type = redact(type, secrets).slice(0, ERROR_MESSAGE_LIMIT);
  if (message !== undefined) {
    const scrubbed = redact(message, secrets);
    summary.message = scrubbed.slice(0, ERROR_MESSAGE_LIMIT);
    // Measured on what is written, not on what arrived: redaction shortens the
    // text, and `truncated` is a statement about the sentence being read.
    if (scrubbed.length > ERROR_MESSAGE_LIMIT) summary.truncated = true;
  }
  // Not silence. "The provider refused and said something this file could not
  // read" is a different diagnosis from "nothing came back", and the size is
  // what separates an empty body from a gateway's HTML page.
  if (type === undefined && message === undefined) summary.unrecognized = true;
  return summary;
}

// Struck out rather than trusted not to appear. A credential is the one string
// here whose exact value is known, so it is the one leak that can be closed by
// matching instead of by hoping.
// The one thing this log has ever needed from a header is which of the two
// response branches a reply took, and that is the media type by itself. The
// value it comes from is written upstream: the parameters after a semicolon,
// and anything a gateway decides to put there instead, are text this file has
// no claim over - and the log says it holds no header at all. So the value is
// reduced to its media type, and kept only if that is what it turns out to be.
function mediaType(value) {
  if (typeof value !== 'string') return null;
  const type = value.split(';')[0].trim().toLowerCase();
  return /^[a-z0-9][a-z0-9.+_-]*\/[a-z0-9][a-z0-9.+_-]*$/.test(type) ? type : null;
}

function redact(text, secrets) {
  let out = text;
  for (const secret of secrets) {
    // Empty only. Splitting on '' explodes the text into single characters,
    // which is the one input this cannot take - and it is not a length below
    // which a credential stops being one. Nothing here validates how long a
    // configured token is, so a guarantee that depended on that would hold for
    // some keys and not others. A short token redacted noisily costs
    // legibility in a diagnostic; the other way costs a key.
    if (typeof secret === 'string' && secret !== '') out = out.split(secret).join('[redacted]');
  }
  return out;
}

class ToolNames {
  constructor() { this.originals = new Map(); }

  // Every name that travels upstream is claimed, whether this rewrote it or
  // not. Two tools arriving under one name is not a case to resolve quietly:
  // upstream would see a duplicate definition, and a response naming it would
  // be restored as whichever tool claimed it, which is how a call meant for one
  // tool gets delivered to another.
  claim(upstream, original) {
    const previous = this.originals.get(upstream);
    if (previous && previous !== original) throw new Error('Tool alias collision');
    this.originals.set(upstream, original);
    return upstream;
  }

  shorten(name) {
    if (typeof name !== 'string') return name;
    // A name short enough to pass through still has to be claimed: an alias
    // generated for some longer tool can land on exactly this string, and
    // whichever of the two is processed second would otherwise take it over
    // in silence.
    if (name.length <= 64) return this.claim(name, name);
    const label = name.split('__').at(-1).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 42);
    const alias = 'muse_' + label + '_' + createHash('sha256').update(name).digest('hex').slice(0, 16);
    return this.claim(alias, name);
  }

  restore(name) { return this.originals.get(name) || name; }

  blocks(blocks, outgoing) {
    if (!Array.isArray(blocks)) return;
    for (const block of blocks) {
      if (['tool_use', 'server_tool_use'].includes(block.type)) {
        block.name = outgoing ? this.shorten(block.name) : this.restore(block.name);
      }
      if (block.type === 'tool_reference') {
        block.tool_name = outgoing ? this.shorten(block.tool_name) : this.restore(block.tool_name);
      }
      // Never rewrite tool inputs, schemas, or ordinary text containing a name.
      if (block.type === 'tool_result') this.blocks(block.content, outgoing);
    }
  }

  request(body) {
    for (const tool of body.tools || []) {
      tool.name = this.shorten(tool.name);
      if (Array.isArray(tool.allowed_callers)) tool.allowed_callers = tool.allowed_callers.map(n => this.shorten(n));
    }
    if (body.tool_choice?.name) body.tool_choice.name = this.shorten(body.tool_choice.name);
    for (const message of body.messages || []) this.blocks(message.content, true);
    return body;
  }

  response(body) {
    this.blocks(body.content, false);
    if (body.content_block) this.blocks([body.content_block], false);
    if (body.message) this.blocks(body.message.content, false);
    return body;
  }
}

// Meta accepts only the plain `{"type":"ephemeral"}` form of cache_control.
// Claude Code adds `ttl` and `scope` extensions when it believes it may use the
// extended cache. Reducing the object to its type downgrades to the provider's
// default cache instead of failing the whole request with HTTP 400.
// Only the four places the API allows the field is it ours to touch: a tool
// definition, a system block, a message content block, and the content blocks
// inside a tool_result. Everything else — a tool's `input_schema`, the `input`
// of a past tool_use — is application data, where a field named cache_control
// belongs to that tool and means whatever the tool says it means. Walking the
// whole body would silently reduce an MCP schema property of that name to
// `{"type": ...}`, dropping its own `properties` and `description` on the way
// through, and the tool would then be described wrongly to the model.
//
// `portableSchemas` below is the one transform that does reach into
// `input_schema`, and it removes a single unusable constraint rather than
// rewriting anything. Nothing else in this file reads a tool's own data.
// FORCE_PROMPT_CACHING_5M pins the provider default at the source, and with
// that variable set a direct connection never produced the 400 this guards
// against, so on a good day nothing here fires. It stays anyway. That variable
// is undocumented; a Claude Code release can rename or drop it without notice,
// and the failure mode when it does is every request refused. The reductions
// are counted into the debug log so the day the variable stops working shows
// up as a log line rather than only as a broken install.
function plainCacheControl(body) {
  if (!body || typeof body !== 'object') return body;
  let reduced = 0;
  const reduce = holder => {
    const value = holder && holder.cache_control;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      for (const extra of Object.keys(value)) if (extra !== 'type') { delete value[extra]; reduced++; }
    }
  };
  const blocks = content => {
    if (!Array.isArray(content)) return;
    for (const block of content) {
      if (!block || typeof block !== 'object') continue;
      reduce(block);
      if (block.type === 'tool_result') blocks(block.content);
    }
  };
  blocks(body.system);
  if (Array.isArray(body.tools)) for (const tool of body.tools) reduce(tool);
  if (Array.isArray(body.messages)) for (const message of body.messages) blocks(message && message.content);
  if (reduced) debugLog({ event: 'cache_control_reduced', fields: reduced });
  return body;
}

// A request this adapter refuses to forward, reported to Claude Code as a 400
// with an explanation rather than an opaque upstream failure.
class UnsupportedRequest extends Error {}

// Meta's `web_search_20250305` accepts `type`, `name`, `user_location` and
// `cache_control`, and rejects every other field with HTTP 400.
//
// Claude Code always sends `max_uses`, a cap on how many searches one turn may
// run. Dropping it costs only that cap — the provider applies its own — so web
// search works instead of failing on every call.
//
// `allowed_domains` and `blocked_domains` are different: they are a restriction
// the operator configured. Forwarding a search without them would query domains
// they deliberately excluded, so those requests are refused here, with an
// explanation, instead of being quietly widened.
const WEB_SEARCH_KEEP = ['type', 'name', 'user_location', 'cache_control'];
const WEB_SEARCH_REFUSE = ['allowed_domains', 'blocked_domains'];

function webSearchTools(body) {
  for (const tool of body.tools || []) {
    if (typeof tool?.type !== 'string' || !tool.type.startsWith('web_search')) continue;
    const refused = WEB_SEARCH_REFUSE.filter(field => tool[field] !== undefined);
    if (refused.length) {
      throw new UnsupportedRequest(
        'Meta does not support ' + refused.join(' or ') + ' on web_search. Remove the ' +
        'domain filter from your Claude Code settings, or disable the WebSearch tool.'
      );
    }
    for (const field of Object.keys(tool)) if (!WEB_SEARCH_KEEP.includes(field)) delete tool[field];
  }
  return body;
}

// Meta compiles every JSON Schema `pattern` a tool declares with a strict
// ECMA-262 validator, and refuses the whole request when one of them does not
// parse. Claude Code 2.1.266 ships one that does not: the Artifact tool
// constrains its `field` argument with `\p{Cc}` and friends. Those are Unicode
// property escapes, and in the CLI they sit in a regex literal carrying the
// `u` flag that gives them a meaning. A `pattern` is a bare string and carries
// no flags, so what arrives upstream is a regex the provider cannot compile.
//
// One bad schema among the whole set kills every call in the session, so the
// visible symptom is that the model is unavailable rather than that one tool is
// broken. The schema is also behind a server-side feature gate, which is why
// the same CLI build fails on one machine and works on another, and why the
// set of schemas sent can change without an update. Matching the class - a
// Unicode property escape anywhere in a pattern - rather than this one regex
// is what keeps the next gated schema from reopening this.
//
// Only the constraint is removed, never the property it constrained. `pattern`
// tells the provider what to reject; it is not part of what the model reads to
// decide how to call the tool. Dropping it widens what the request may carry
// and changes nothing the model is shown, and the tool still validates its own
// arguments when the call arrives.
//
// That widening is what makes dropping safe, and it is a property of the
// schema around the constraint rather than of the constraint. Under `not` the
// polarity reverses - `{not: {pattern: ...}}` becomes `{not: {}}`, and the
// empty schema accepts everything, so the negation rejects everything - while
// `if` flips which branch applies and widening one `oneOf` branch can make two
// match and fail the whole. Beneath any of those, dropping narrows, and the
// request is refused with an explanation instead. The same is true of a
// `patternProperties` entry under a restrictive `additionalProperties` or
// `unevaluatedProperties`. So the guarantee is checked here, not assumed.
//
// The match is textual on purpose. A pattern that merely spells `\p` in an
// escaped position loses a constraint it did not have to lose, which widens
// what the request may carry and never rejects one; reading regex escape state
// to avoid that would be more machinery than the failure is worth.
//
// Which key means what depends on where it sits. `const`, `default`, `enum`,
// `example` and `examples` hold arbitrary JSON rather than subschemas, so a
// member named `pattern` inside one of them is a value the tool receives and
// is left alone, as is anything under the conventional `x-` extension space.
// But `properties` and `$defs` map a name the tool chose to a subschema, and
// those names are not keywords: an argument called `default` is a schema and
// has to be descended into, or its pattern survives and produces the very 400
// this prevents.
//
// The maps are listed rather than detected, because missing one puts its
// subschemas back under keyword rules. This is every keyword across draft-07,
// 2019-09 and 2020-12 whose value is keyed by a name the tool chose;
// `dependencies` is in it for its draft-07 subschema form, and its other form,
// a list of required property names, is walked harmlessly. `dependentRequired`
// is absent because it only ever holds those lists.
//
// A keyword in neither list is walked as a schema. JSON Schema lets a tool add
// keywords of its own, so this cannot be decided from a list of the ones that
// carry subschemas: such a list has to be complete to be safe, and `items`,
// `contains`, `propertyNames`, `contentSchema` and the rest are only the ones
// that exist today. Guessing wrong towards a schema costs a constraint the
// provider would have enforced and never a request - the widening check above
// is what keeps that true - while guessing wrong the other way leaves a
// pattern it refuses, and every turn in the session ends. Only the second is
// worth avoiding, which is why the unknown case defaults to a schema and the
// exceptions are named instead.
const UNICODE_PROPERTY = /\\[pP]\{/;
const SCHEMA_VALUES = ['const', 'default', 'enum', 'example', 'examples'];
const EXTENSION_KEY = /^x-/;
const NON_MONOTONIC = ['not', 'if', 'oneOf'];

// Absent or `true` leaves the object open; anything else can reject a name.
function restrictive(value) {
  return value !== undefined && value !== true;
}
const SCHEMA_MAPS = [
  'properties', 'patternProperties', '$defs', 'definitions', 'dependencies', 'dependentSchemas',
];

function portableSchemas(body) {
  for (const tool of (body && body.tools) || []) {
    dropUnicodePatterns(tool.input_schema, { widens: true, sealed: false });
  }
  return body;
}

// A `patternProperties` key is a regular expression as much as a `pattern` is,
// and the provider compiles it the same way, so a schema can be refused for a
// key alone. Only this map is keyed by a regex; `properties`, `$defs` and the
// rest are keyed by names.
//
// Removing the whole entry is what widens here. The names it matched become
// unconstrained, and they are still accepted - unless a sibling
// `additionalProperties` would now reject them, because a name matching any
// `patternProperties` key is exempt from it. Then removal is a narrowing:
// arguments the tool declared valid would start being refused. That is a
// change to what the tool accepts rather than to what the provider will
// compile, so it is refused here with an explanation instead, the way a
// web_search domain filter is.
function dropUnicodeKeys(schema, map, context) {
  for (const key of Object.keys(map)) {
    if (!UNICODE_PROPERTY.test(key)) continue;
    if (!context.widens) {
      throw new UnsupportedRequest(
        'A tool schema names properties with ' + key + ' beneath not, if or oneOf, where Meta ' +
        'cannot compile it and removing it would reject arguments the tool declares valid. ' +
        'Remove the Unicode property escape from that tool schema, or turn the tool off.'
      );
    }
    if (restrictive(schema.additionalProperties) || context.sealed) {
      throw new UnsupportedRequest(
        'A tool schema names properties with ' + key + ', which Meta cannot compile, and its ' +
        'additionalProperties or unevaluatedProperties would reject the names that pattern ' +
        'allows. Remove the Unicode property escape from that tool schema, or turn the tool off.'
      );
    }
    delete map[key];
  }
}

// `node` is a subschema, or an array of them. Anything reached from here is
// read as a schema unless one of the lists above says otherwise.
function dropUnicodePatterns(node, context) {
  if (Array.isArray(node)) {
    for (const item of node) dropUnicodePatterns(item, context);
    return;
  }
  if (!node || typeof node !== 'object') return;
  // Read before the walk, so the seal holds whatever order the keys arrive in.
  const sealed = context.sealed || restrictive(node.unevaluatedProperties);
  const here = sealed === context.sealed ? context : { widens: context.widens, sealed };
  for (const [key, value] of Object.entries(node)) {
    if (key === 'pattern' && typeof value === 'string') {
      if (!UNICODE_PROPERTY.test(value)) continue;
      if (!here.widens) {
        throw new UnsupportedRequest(
          'A tool schema constrains a value with ' + value + ' beneath not, if or oneOf, where ' +
          'Meta cannot compile it and removing it would reject arguments the tool declares ' +
          'valid. Remove the Unicode property escape from that tool schema, or turn the tool off.'
        );
      }
      delete node[key];
    } else if (SCHEMA_VALUES.includes(key) || EXTENSION_KEY.test(key)) {
      continue;
    } else if (SCHEMA_MAPS.includes(key)) {
      if (value && typeof value === 'object') {
        if (key === 'patternProperties') dropUnicodeKeys(node, value, here);
        for (const sub of Object.values(value)) dropUnicodePatterns(sub, here);
      }
    } else {
      dropUnicodePatterns(value, NON_MONOTONIC.includes(key) ? { widens: false, sealed: here.sealed } : here);
    }
  }
}

// Meta rejects `stop_sequences` outright with HTTP 400.
//
// Claude Code sends it on the auto-mode safety classifier call - the request
// that decides whether a tool call may run without stopping to ask. That
// request carries no tools and does not stream, which is why it is the only
// place the field appears and why ordinary turns in the same session are
// unaffected. Claude Code renders the resulting 400 as "the model is
// temporarily unavailable", so the visible symptom is that every gated tool -
// Bash, Edit, Agent - fails while reading files keeps working.
//
// Dropping the field changes where generation stops, not what it contains: the
// model may run past the point the caller meant to cut. That is a real cost,
// and the alternative is a feature that never works at all.
function stopSequences(body) {
  if (body && typeof body === 'object') delete body.stop_sequences;
  return body;
}

// Buffers a non-streaming body chunk by chunk rather than through `.json()` or
// `.arrayBuffer()`, so the idle timer sees the transfer and a slow but healthy
// download is not mistaken for a dead connection.
async function collect(body, active) {
  const chunks = [];
  if (body) for await (const chunk of body) { active(); chunks.push(chunk); }
  return Buffer.concat(chunks);
}

// A streaming reply commits to its status line before it knows how the turn
// ends. The provider answers 200, opens the stream, and can still emit
// `event: error` a second later - upstream overloaded, context too long, the
// turn refused. Nothing about that reaches the status the log already recorded,
// so a failed turn read as a successful one, which is the reading that sends a
// user looking at their own machine.
//
// Returns the data of an error event, for `errorSummary` to reduce to the two
// fields it declares, and null for everything else. Never throws: a frame this
// cannot parse is `sseFrame`'s to report, and a diagnostic must not be what
// ends a stream.
function sseError(frame) {
  const data = sseData(frame);
  if (!data || data === '[DONE]') return null;
  let parsed;
  try { parsed = JSON.parse(data); } catch { return null; }
  return parsed && parsed.type === 'error' ? data : null;
}

function sseData(frame) {
  return frame.split(/\r?\n/)
    .filter(line => line.startsWith('data:'))
    .map(line => line.slice(5).replace(/^ /, ''))
    .join('\n');
}

function sseFrame(frame, names) {
  const lines = frame.split(/\r?\n/);
  const data = sseData(frame);
  if (!data || data === '[DONE]') return frame;
  const body = names.response(parseJson(data, 'An upstream event'));
  return [...lines.filter(l => !l.startsWith('data:')), 'data: ' + JSON.stringify(body)].join('\n');
}

async function startProxy(upstream, token, idleSeconds) {
  const origin = new URL(upstream);
  const localToken = randomBytes(32).toString('hex');
  // Every string whose exact value is known and must never reach the log,
  // gathered once so no path out of this file can be given a shorter list than
  // another. The configured URL carries credentials of its own when a gateway
  // is written as `https://user:password@host`, and `fetch` refuses such a URL
  // by throwing an error that quotes the whole of it - on every request, not on
  // some rare path.
  const secrets = [token, localToken, origin.password, origin.username].filter(Boolean);
  // Idle, not wall-clock. A high-effort turn over a large context can stream for
  // far longer than any fixed cutoff, and aborting a healthy stream mid-flight
  // would truncate the turn: the headers have already gone out, so there is no
  // way left to report an error. Every byte in either direction restarts this,
  // which leaves it measuring only genuine silence.
  const idleMs = Number(idleSeconds) > 0 ? Number(idleSeconds) * 1000 : 300000;
  const server = http.createServer(async (req, res) => {
    // Logged before the checks below, not after. A request this proxy turns
    // away leaves no other trace, and "no entry at all" is exactly what
    // distinguishes a client calling somewhere this adapter does not serve
    // from one whose request reached the provider and was refused there.
    debugLog({ event: 'incoming', method: req.method, path: req.url.split('?')[0] });
    if (req.headers.authorization !== 'Bearer ' + localToken) {
      debugLog({ event: 'rejected', reason: 'auth', method: req.method, path: req.url.split('?')[0] });
      res.writeHead(401).end();
      return;
    }
    if (!req.url.startsWith('/v1/') || !['POST', 'GET'].includes(req.method)) {
      debugLog({ event: 'rejected', reason: 'path', method: req.method, path: req.url.split('?')[0] });
      res.writeHead(404).end();
      return;
    }
    // Per request, not per proxy. What a name maps to only has to hold for the
    // one body it travels in, and aliases are a pure function of the tool name,
    // so nothing needs carrying between turns. Keeping one table for the life of
    // the proxy would let a name claimed by a tool set that is no longer loaded
    // — a subagent's, say — reject a later request that collides with nothing.
    const names = new ToolNames();
    const abort = new AbortController();
    res.on('close', () => { if (!res.writableFinished) abort.abort(); });
    // The signal reaches `fetch`, but a client that stalls halfway through its
    // upload never gets that far: the read loop below would park on a socket
    // that stays open and simply never speaks again, and nothing would observe
    // the abort. Destroying the request makes that read throw instead, so
    // silence is abandoned wherever in the turn it happens. A request that was
    // read to the end is already complete, so this leaves it alone.
    abort.signal.addEventListener('abort', () => req.destroy(), { once: true });
    let timer;
    const active = () => {
      clearTimeout(timer);
      timer = setTimeout(() => abort.abort(), idleMs);
    };
    active();
    try {
      const chunks = [];
      let size = 0;
      for await (const chunk of req) {
        active();
        size += chunk.length;
        if (size > 64 * 1024 * 1024) { res.writeHead(413).end(); return; }
        chunks.push(chunk);
      }
      const raw = Buffer.concat(chunks).toString('utf8');
      const headers = new Headers();
      for (const [key, value] of Object.entries(req.headers)) {
        if (!['host', 'content-length', 'connection', 'authorization', 'x-api-key', 'accept-encoding', 'transfer-encoding'].includes(key)) {
          headers.set(key, Array.isArray(value) ? value.join(', ') : value);
        }
      }
      headers.set('authorization', 'Bearer ' + token);
      const target = new URL(origin);
      target.pathname = origin.pathname.replace(/\/$/, '') + req.url.split('?')[0];
      target.search = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
      let payload;
      if (raw) {
        const parsed = parseJson(raw, 'The request body');
        debugLog({
          event: 'request', method: req.method, path: req.url.split('?')[0],
          // What arrived on the socket, already counted by the read loop above.
          // `raw.length` would be UTF-16 code units of the decoded string: a CJK
          // character counts one instead of three, so a prompt or a tool schema
          // in any non-Latin script reports a body far smaller than the one that
          // was sent - and size is the first thing read when a request is
          // suspected of being too large.
          model: parsed.model, stream: parsed.stream === true, bytes: size,
          tools: Array.isArray(parsed.tools) ? parsed.tools.length : 0,
          messages: Array.isArray(parsed.messages) ? parsed.messages.length : 0,
          longest_tool: Math.max(0, ...(parsed.tools || []).map(t => (t && typeof t.name === 'string' ? t.name.length : 0))),
        });
        payload = JSON.stringify(stopSequences(plainCacheControl(portableSchemas(webSearchTools(names.request(parsed))))));
      }
      const response = await fetch(target, {
        method: req.method, headers, redirect: 'error', signal: abort.signal,
        body: payload,
      });
      active();
      debugLog({ event: 'response', status: response.status, type: mediaType(response.headers.get('content-type')) });
      res.statusCode = response.status;
      for (const [key, value] of response.headers) {
        if (!['content-length', 'content-encoding', 'transfer-encoding', 'connection'].includes(key)) res.setHeader(key, value);
      }
      if (response.headers.get('content-type')?.includes('text/event-stream')) {
        const decoder = new TextDecoder();
        let buffer = '';
        // Read from the frames on their way through, so the entry sits beside
        // the `response` line that recorded the 200 and contradicts it.
        const reportStreamError = frame => {
          const failure = sseError(frame);
          if (failure) {
            debugLog({
              event: 'upstream_error', status: response.status, stream: true,
              ...errorSummary(failure, secrets),
            });
          }
        };
        for await (const chunk of response.body) {
          active();
          buffer += decoder.decode(chunk, { stream: true });
          let match;
          while ((match = /\r?\n\r?\n/.exec(buffer))) {
            const frame = buffer.slice(0, match.index);
            buffer = buffer.slice(match.index + match[0].length);
            reportStreamError(frame);
            if (!res.write(sseFrame(frame, names) + '\n\n')) await once(res, 'drain', { signal: abort.signal });
          }
        }
        buffer += decoder.decode();
        if (buffer) {
          reportStreamError(buffer);
          res.write(sseFrame(buffer, names) + '\n\n');
        }
        res.end();
      } else if (response.headers.get('content-type')?.includes('json')) {
        const text = (await collect(response.body, active)).toString('utf8');
        if (response.status >= 400) debugLog({ event: 'upstream_error', status: response.status, ...errorSummary(text, secrets) });
        res.end(JSON.stringify(names.response(parseJson(text, 'The upstream reply'))));
      } else {
        const buffered = await collect(response.body, active);
        if (response.status >= 400) debugLog({ event: 'upstream_error', status: response.status, ...errorSummary(buffered, secrets) });
        res.end(buffered);
      }
    } catch (error) {
      // The last string from outside this file that reached the log unscrubbed.
      // A fault here is the adapter's own to report, but the sentence reporting
      // it is written by Node, and it quotes what it was given.
      debugLog({
        event: 'adapter_error', name: error && error.name,
        message: redact(String((error && error.message) || ''), secrets).slice(0, ERROR_MESSAGE_LIMIT),
      });
      const refused = error instanceof UnsupportedRequest;
      if (!res.headersSent) {
        res.writeHead(refused ? 400 : 502, { 'content-type': 'application/json' });
        res.end(JSON.stringify({
          type: 'error',
          error: refused
            ? { type: 'invalid_request_error', message: error.message }
            : { type: 'api_error', message: 'Local Muse adapter could not complete the upstream request.' },
        }));
      } else res.destroy();
    } finally { clearTimeout(timer); }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return { server, url: 'http://127.0.0.1:' + server.address().port, token: localToken };
}

module.exports = { ToolNames, sseFrame, sseError, startProxy, plainCacheControl, webSearchTools, portableSchemas, stopSequences, UnsupportedRequest, errorSummary, parseJson, mediaType };
```

Create `~/.local/lib/claude-muse/launcher.test.cjs` with this exact content:

```javascript
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  parseEnvFile, loadConfig, checkBaseUrl, scrubEnv, buildChildEnv, claudeArgs, debugTarget, openDebugLog,
  findOnPath, targetFromShim, resolveClaude, claudeNames, spawnOptions, signalPlan, hasControllingTerminal, exitStatus,
} = require('./launcher.cjs');

const KEY = 'LLM|1234567890|abcdefg_hijklmn';

function tempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-muse-test-'));
  test.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test('a debug log is opened before the run starts, private, and never over a name already taken', () => {
  const dir = tempDir();
  const generated = path.join(dir, 'generated.log');
  openDebugLog(generated, false);
  // Opened, not merely tested for: the path the launcher is about to announce
  // exists by the time it says so.
  assert.equal(fs.existsSync(generated), true);
  // The default lands in a directory every account on the machine can write to,
  // so the rights are set at creation rather than left to the umask. Windows
  // has no POSIX mode to read back.
  if (process.platform !== 'win32') {
    assert.equal(fs.statSync(generated).mode & 0o777, 0o600);
  }
  // A name this program invented is created exclusively. One already sitting
  // there was put there by somebody else - a symlink into another file, in a
  // directory anyone can write to - and appending to it is the thing to refuse.
  assert.throws(() => openDebugLog(generated, false), /cannot write the debug log/);

  // A path the user named is appended to, existing or not: two runs into one
  // file keep both.
  const named = path.join(dir, 'named.log');
  fs.writeFileSync(named, 'earlier\n');
  openDebugLog(named, true);
  assert.equal(fs.readFileSync(named, 'utf8'), 'earlier\n');

  assert.throws(
    () => openDebugLog(path.join(dir, 'absent', 'x.log'), true),
    error => /cannot write the debug log/.test(error.message) && /ENOENT/.test(error.message)
  );
});

test('high is the default effort but an explicit CLI effort wins', () => {
  assert.deepEqual(claudeArgs(['-p', 'hello'], 'high'), ['--effort', 'high', '-p', 'hello']);
  assert.deepEqual(claudeArgs(['--effort', 'low', '-p', 'hello'], 'high'), ['--effort', 'low', '-p', 'hello']);
  assert.deepEqual(claudeArgs(['--effort=medium', '-p', 'hello'], 'high'), ['--effort=medium', '-p', 'hello']);
});

test('provider.env survives a Windows editor: BOM, CRLF, quotes, comments', () => {
  const config = parseEnvFile(
    '﻿# Add the Meta Model API key between single quotes.\r\n' +
    "MUSE_AUTH_TOKEN='" + KEY + "'\r\n" +
    "MUSE_BASE_URL='https://api.meta.ai'\r\n" +
    'export MUSE_MODEL="muse-spark-1.3-contributor"\r\n' +
    '\r\n' +
    'MUSE_EFFORT=high # trailing note\r\n' +
    'not a setting\r\n' +
    "MUSE_MAX_CONTEXT_TOKENS='1048576'"
  );
  assert.equal(config.MUSE_AUTH_TOKEN, KEY);
  assert.equal(config.MUSE_BASE_URL, 'https://api.meta.ai');
  assert.equal(config.MUSE_MODEL, 'muse-spark-1.3-contributor');
  assert.equal(config.MUSE_EFFORT, 'high');
  assert.equal(config.MUSE_MAX_CONTEXT_TOKENS, '1048576');
  assert.equal(Object.keys(config).length, 5);
});

test('a comment after a quoted value is a comment, not part of the value', () => {
  const config = parseEnvFile(
    "MUSE_BASE_URL='https://api.meta.ai' # production\n" +
    'MUSE_MODEL="muse-spark-1.3-contributor"  # pinned\n' +
    "MUSE_AUTH_TOKEN='" + KEY + "' # rotated 2026-09-01\n" +
    // A # inside the quotes belongs to the value: the closing quote is found
    // before any comment is looked for.
    "MUSE_EFFORT='high # not a comment'\n" +
    // Nothing sensible to salvage from an unterminated quote, so it is left be.
    "MUSE_MAX_CONTEXT_TOKENS='1048576"
  );
  assert.equal(config.MUSE_BASE_URL, 'https://api.meta.ai');
  assert.doesNotThrow(() => new URL(config.MUSE_BASE_URL));
  assert.equal(config.MUSE_MODEL, 'muse-spark-1.3-contributor');
  assert.equal(config.MUSE_AUTH_TOKEN, KEY);
  assert.equal(config.MUSE_EFFORT, 'high # not a comment');
  assert.equal(config.MUSE_MAX_CONTEXT_TOKENS, "'1048576");
});

test('loadConfig applies defaults, rejects the placeholder and an empty key', () => {
  const read = text => () => text;
  const full = loadConfig('provider.env', read("MUSE_AUTH_TOKEN='" + KEY + "'\nMUSE_BASE_URL='https://api.meta.ai'\nMUSE_EFFORT=''\n"));
  assert.equal(full.MUSE_EFFORT, 'high');
  assert.equal(full.MUSE_MODEL, 'muse-spark-1.3-contributor');
  assert.equal(full.MUSE_MAX_CONTEXT_TOKENS, '1048576');
  assert.throws(() => loadConfig('provider.env', read("MUSE_AUTH_TOKEN=''\nMUSE_BASE_URL='https://api.meta.ai'\n")), /set MUSE_AUTH_TOKEN/);
  assert.throws(() => loadConfig('provider.env', read("MUSE_AUTH_TOKEN='LLM|YOUR_NUMERIC_ID|YOUR_SECRET'\nMUSE_BASE_URL='x'\n")), /set MUSE_AUTH_TOKEN/);
  assert.throws(() => loadConfig('provider.env', read("MUSE_AUTH_TOKEN='" + KEY + "'\n")), /MUSE_BASE_URL is not set/);
  assert.throws(() => loadConfig('/no/such/provider.env'), /configuration not found/);
});

test('the child environment is scrubbed and the key never reaches it', () => {
  const config = { MUSE_MODEL: 'muse-spark-1.3-contributor', MUSE_CAPABILITIES: 'effort', MUSE_MAX_CONTEXT_TOKENS: '1048576', MUSE_AUTH_TOKEN: KEY };
  const source = { PATH: '/usr/bin', ANTHROPIC_API_KEY: 'sk-leftover', CLAUDE_CODE_EFFORT_LEVEL: 'low', MUSE_AUTH_TOKEN: KEY, KEEP_ME: 'yes' };

  const posix = buildChildEnv(source, config, false);
  assert.equal(posix.ANTHROPIC_API_KEY, undefined);
  assert.equal(posix.CLAUDE_CODE_EFFORT_LEVEL, undefined);
  assert.equal(posix.MUSE_AUTH_TOKEN, undefined);
  assert.equal(posix.KEEP_ME, 'yes');
  assert.equal(posix.ANTHROPIC_DEFAULT_HAIKU_MODEL, 'muse-spark-1.3-contributor');
  assert.equal(posix.CLAUDE_CODE_SUBAGENT_MODEL, 'muse-spark-1.3-contributor');
  assert.equal(posix.ENABLE_TOOL_SEARCH, 'false');
  assert.equal(posix.FORCE_PROMPT_CACHING_5M, '1');
  assert.equal(posix.CLAUDE_CODE_MAX_CONTEXT_TOKENS, '1048576');
  assert.equal(JSON.stringify(posix).includes(KEY), false);

  // Windows environment names are case-insensitive; POSIX names are not.
  const mixed = { Anthropic_Api_Key: 'sk-leftover', claude_config_dir: '/elsewhere', KEEP_ME: 'yes' };
  assert.deepEqual(Object.keys(scrubEnv(mixed, true)), ['KEEP_ME']);
  assert.deepEqual(Object.keys(scrubEnv(mixed, false)).sort(), ['Anthropic_Api_Key', 'KEEP_ME', 'claude_config_dir']);
});

test('POSIX resolves claude itself; Windows finds the real executable on PATH', () => {
  assert.deepEqual(resolveClaude(false, ''), { file: 'claude', prefix: [] });

  const dir = tempDir();
  const exe = path.join(dir, 'claude.exe');
  fs.writeFileSync(exe, 'binary');
  assert.deepEqual(resolveClaude(true, ['/nowhere', dir].join(path.delimiter)), { file: exe, prefix: [] });
  assert.equal(findOnPath(['claude.exe'], '/nowhere'), null);
  assert.equal(resolveClaude(true, '/nowhere'), null);
});

// cmd-shim writes this exact head for every shim it generates.
const SHIM_HEAD = ['@ECHO off', 'GOTO start', ':find_dp0', 'SET dp0=%~dp0',
  'EXIT /b', ':start', 'SETLOCAL', 'CALL :find_dp0'].join('\r\n') + '\r\n';

test('Windows reads the npm shim: a native binary is run directly', () => {
  // Claude Code ships a native binary, so cmd-shim finds no shebang and writes
  // a shim that names the .exe. The .exe itself is not on PATH.
  const dir = tempDir();
  const exe = path.join(dir, 'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe');
  fs.mkdirSync(path.dirname(exe), { recursive: true });
  fs.writeFileSync(exe, 'MZ');
  const shim = path.join(dir, 'claude.cmd');
  fs.writeFileSync(shim, SHIM_HEAD +
    '"%dp0%\\node_modules\\@anthropic-ai\\claude-code\\bin\\claude.exe"  %*\r\n');

  assert.equal(targetFromShim(shim), exe);
  assert.deepEqual(resolveClaude(true, dir), { file: exe, prefix: [] });
});

test('Windows reads the npm shim: a .js entry point runs under this Node', () => {
  const dir = tempDir();
  const script = path.join(dir, 'node_modules', '@anthropic-ai', 'claude-code', 'cli-wrapper.cjs');
  fs.mkdirSync(path.dirname(script), { recursive: true });
  fs.writeFileSync(script, '#!/usr/bin/env node\n');
  const shim = path.join(dir, 'claude.cmd');
  fs.writeFileSync(shim, SHIM_HEAD +
    '\r\nIF EXIST "%dp0%\\node.exe" (\r\n  SET "_prog=%dp0%\\node.exe"\r\n) ELSE (\r\n' +
    '  SET "_prog=node"\r\n  SET PATHEXT=%PATHEXT:;.JS;=;%\r\n)\r\n\r\n' +
    'endLocal & goto #_undefined_# 2>NUL || title %COMSPEC% & "%_prog%"  ' +
    '"%dp0%\\node_modules\\@anthropic-ai\\claude-code\\cli-wrapper.cjs" %*\r\n');

  assert.equal(targetFromShim(shim), script);
  assert.deepEqual(resolveClaude(true, dir), { file: process.execPath, prefix: [script] });
});

test('a real claude.exe on PATH wins, and an unreadable shim yields nothing', () => {
  const dir = tempDir();
  const exe = path.join(dir, 'claude.exe');
  fs.writeFileSync(exe, 'MZ');
  fs.writeFileSync(path.join(dir, 'claude.cmd'), SHIM_HEAD + '"%dp0%\\gone.exe"  %*\r\n');
  assert.deepEqual(resolveClaude(true, dir), { file: exe, prefix: [] });

  const empty = tempDir();
  fs.writeFileSync(path.join(empty, 'claude.cmd'), 'echo nothing useful here\r\n');
  assert.equal(targetFromShim(path.join(empty, 'claude.cmd')), null);
  assert.equal(resolveClaude(true, empty), null);
});

test('PATHEXT decides which form wins inside a directory', () => {
  // Both installed side by side, which is what an npm install next to a native
  // one looks like. The order is the user's to set, not this launcher's.
  const dir = tempDir();
  const exe = path.join(dir, 'claude.exe');
  const shipped = path.join(dir, 'node_modules', '@anthropic-ai', 'claude-code', 'claude.exe');
  fs.mkdirSync(path.dirname(shipped), { recursive: true });
  fs.writeFileSync(exe, 'MZ');
  fs.writeFileSync(shipped, 'MZ');
  fs.writeFileSync(path.join(dir, 'claude.cmd'), SHIM_HEAD +
    '"%dp0%\\node_modules\\@anthropic-ai\\claude-code\\claude.exe"  %*\r\n');

  assert.deepEqual(resolveClaude(true, dir, '.COM;.EXE;.BAT;.CMD'), { file: exe, prefix: [] });
  assert.deepEqual(resolveClaude(true, dir, '.COM;.CMD;.BAT;.EXE'), { file: shipped, prefix: [] });
  // Unset, and PATHEXT without any of these, both fall back to the conventional
  // order rather than finding nothing.
  assert.deepEqual(resolveClaude(true, dir, undefined), { file: exe, prefix: [] });
  assert.deepEqual(resolveClaude(true, dir, '.VBS;.JS'), { file: exe, prefix: [] });
  // .PS1 is never in PATHEXT, so it has to survive as the last resort.
  assert.ok(claudeNames('.EXE').includes('claude.ps1'));
  assert.deepEqual(claudeNames('.CMD;.EXE'), ['claude.cmd', 'claude.exe', 'claude.com', 'claude.ps1']);
});

test('the child stays in the shell-controlled job, and terminal signals are not doubled', () => {
  // Detaching would put the child outside the terminal's session, where the
  // kernel stops doing job control for it and SIGTTIN/SIGTTOU stop protecting
  // the shell from it. Job control is worth more than knowing who sent a signal.
  assert.equal(spawnOptions().detached, undefined, 'the child left the shell-controlled job');
  assert.equal(spawnOptions().stdio, 'inherit');

  // The terminal flag is always passed here: read from the real process, this
  // would assert something different under a test runner than under a terminal.
  for (const platform of ['linux', 'darwin', 'win32']) {
    const plan = signalPlan(platform, true);
    // Ctrl+C and a hangup reach the whole foreground process group, so the child
    // has them already; forwarding would deliver a second SIGINT, which Claude
    // Code takes as a force quit.
    for (const signal of ['SIGINT', 'SIGHUP', 'SIGBREAK']) {
      assert.ok(!plan.forward.includes(signal), `${platform} forwards ${signal} the child already got`);
    }
    assert.ok(plan.absorb.includes('SIGINT'), `${platform} lets SIGINT kill the launcher before the proxy closes`);
    assert.equal(plan.absorb.filter(signal => plan.forward.includes(signal)).length, 0);
  }
  // Everything else — SIGWINCH, SIGQUIT, SIGTSTP, SIGCONT — is left to the
  // kernel, which delivers it to the whole group, the child included.
  assert.deepEqual(signalPlan('linux', true).forward, ['SIGTERM']);

  // With no terminal anywhere, nothing can be signalling the group: what arrives
  // was aimed at this pid alone, so absorbing it would leave a cancelled run
  // still running.
  for (const platform of ['linux', 'darwin']) {
    const plan = signalPlan(platform, false);
    assert.deepEqual(plan.absorb, [], `${platform} still swallows a signal only this process got`);
    for (const signal of ['SIGINT', 'SIGHUP', 'SIGTERM']) {
      assert.ok(plan.forward.includes(signal), `${platform} drops ${signal} instead of passing it on`);
    }
  }
  // Windows has no process groups to reason about and no way to send one of
  // these to a single process, so it does not change with the terminal.
  assert.deepEqual(signalPlan('win32', false), signalPlan('win32', true));

  // Which branch is taken comes from opening the controlling terminal, and from
  // nothing else. isTTY is wrong in both directions: redirected streams in a
  // foreground job still get Ctrl+C, and pty descriptors under `setsid` belong
  // to a process that has no controlling terminal at all. The path is a
  // parameter so both answers can be asserted anywhere.
  const dir = tempDir();
  const present = path.join(dir, 'tty');
  fs.writeFileSync(present, '');
  assert.equal(hasControllingTerminal(present), true);
  assert.equal(hasControllingTerminal(path.join(dir, 'no-such-terminal')), false);
});

test('PATH order decides, not file extension: an early shim beats a later exe', () => {
  // Two installations, the npm shim first. The shell would run that one, so the
  // launcher has to as well — scanning the whole PATH for executables first
  // would silently start the other one.
  const first = tempDir();
  const second = tempDir();
  // As npm installs it: the shim sits on PATH, the binary it names does not.
  const shipped = path.join(first, 'node_modules', '@anthropic-ai', 'claude-code', 'claude.exe');
  fs.mkdirSync(path.dirname(shipped), { recursive: true });
  fs.writeFileSync(shipped, 'MZ');
  fs.writeFileSync(path.join(first, 'claude.cmd'), SHIM_HEAD +
    '"%dp0%\\node_modules\\@anthropic-ai\\claude-code\\claude.exe"  %*\r\n');
  const other = path.join(second, 'claude.exe');
  fs.writeFileSync(other, 'MZ');

  assert.deepEqual(resolveClaude(true, first + path.delimiter + second), { file: shipped, prefix: [] });
  // Reverse the order and the other installation wins, for the same reason.
  assert.deepEqual(resolveClaude(true, second + path.delimiter + first), { file: other, prefix: [] });
});

test('a killed child reports its own signal, not a blanket 143', () => {
  assert.equal(exitStatus(0, null), 0);
  assert.equal(exitStatus(2, null), 2);
  // 128 + the signal number, as a shell reports it. Same numbers on every
  // platform Node runs these on.
  assert.equal(exitStatus(null, 'SIGHUP'), 129);
  assert.equal(exitStatus(null, 'SIGINT'), 130);
  assert.equal(exitStatus(null, 'SIGKILL'), 137);  // the OOM killer, not a polite stop
  assert.equal(exitStatus(null, 'SIGTERM'), 143);
  // Nothing to derive a status from: fall back rather than exit 0 on a death.
  assert.equal(exitStatus(null, 'NOT_A_SIGNAL'), 143);
  assert.equal(exitStatus(null, null), 143);
});

test('the debug flag is stripped from the arguments and names a log file', () => {
  const off = debugTarget(['-p', 'hi']);
  assert.deepEqual(off.args, ['-p', 'hi']);
  assert.equal(off.log, null);
  const bare = debugTarget(['-p', 'hi', '--muse-debug'], '/logs', 7, 'd15c');
  assert.deepEqual(bare.args, ['-p', 'hi']);
  assert.equal(bare.log, path.join('/logs', 'claude-muse-7-d15c.log'));
  assert.equal(bare.chosen, false);
  // Two runs in the same millisecond still get different files, which is the
  // property a timestamp alone does not have.
  assert.notEqual(
    debugTarget(['--muse-debug'], '/logs', 7).log,
    debugTarget(['--muse-debug'], '/logs', 7).log
  );
  const chosen = debugTarget(['--muse-debug=/logs/chosen.log', '-p', 'hi']);
  assert.deepEqual(chosen.args, ['-p', 'hi']);
  assert.equal(chosen.log, '/logs/chosen.log');
  assert.equal(chosen.chosen, true);
});

test('a base URL carrying credentials is refused at load, not at the first request', () => {
  const read = text => () => text;
  const config = key => "MUSE_AUTH_TOKEN='" + KEY + "'\nMUSE_BASE_URL='" + key + "'\n";

  // The shape the HTTP client refuses outright. Caught here, it costs one
  // sentence; caught at the first request it costs every request, as a 502 from
  // a proxy that looks broken.
  assert.throws(
    () => loadConfig('provider.env', read(config('https://user:pw@api.meta.ai'))),
    /carries credentials in the URL/
  );
  // A username with no password is the same mistake half written.
  assert.throws(() => checkBaseUrl('https://user@api.meta.ai', 'provider.env'), /carries credentials/);
  // `new URL` takes any scheme, so a typo in the scheme still parses and still
  // carries the credentials. Refused for that, before the protocol is reached.
  assert.throws(() => checkBaseUrl('htp://user:pw@api.meta.ai', 'provider.env'), /carries credentials/);

  // No message quotes the value: a URL malformed enough not to parse can still
  // carry a password, and this sentence is one a user pastes into a bug report.
  try {
    checkBaseUrl('https://user:s3cret@api meta.ai', 'provider.env');
    assert.fail('expected a refusal');
  } catch (error) {
    assert.match(error.message, /is not a URL/);
    assert.equal(error.message.includes('s3cret'), false);
  }

  assert.throws(() => checkBaseUrl('file:///etc/passwd', 'provider.env'), /http or https/);
  // The ordinary cases stay ordinary, including a plain-http local gateway.
  assert.equal(checkBaseUrl('https://api.meta.ai/v1', 'provider.env'), undefined);
  assert.equal(checkBaseUrl('http://127.0.0.1:8080', 'provider.env'), undefined);
});

test('a bare debug flag never consumes the argument after it', () => {
  // `claude-muse --muse-debug "write a test"` must still send the prompt to
  // Claude Code. Reading the path from the next argument would eat it instead.
  const { args, log } = debugTarget(['--muse-debug', 'write a test'], '/logs', 7, 'd15c');
  assert.deepEqual(args, ['write a test']);
  assert.equal(log, path.join('/logs', 'claude-muse-7-d15c.log'));
});
```

Create `~/.local/lib/claude-muse/adapter.test.cjs` with this exact content:

```javascript
const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const net = require('node:net');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { once } = require('node:events');
const { ToolNames, sseFrame, sseError, startProxy, plainCacheControl, webSearchTools, portableSchemas, stopSequences, UnsupportedRequest, errorSummary, parseJson, mediaType } = require('./adapter.cjs');
const long = 'mcp__plugin_chrome-devtools-mcp_chrome-devtools__get_console_message';

test('long names round-trip without changing inputs or schemas', () => {
  const names = new ToolNames();
  const body = names.request({ tools: [{ name: long, input_schema: { name: long } }], tool_choice: { name: long }, messages: [{ content: [{ type: 'tool_use', name: long, input: { name: long } }, { type: 'tool_result', content: [{ type: 'tool_reference', tool_name: long }] }] }] });
  const alias = body.tools[0].name;
  assert.ok(alias.length <= 64);
  assert.equal(body.tool_choice.name, alias);
  assert.equal(body.tools[0].input_schema.name, long);
  assert.equal(body.messages[0].content[0].input.name, long);
  assert.equal(body.messages[0].content[1].content[0].tool_name, alias);
  assert.equal(names.response({ content: [{ type: 'tool_use', name: alias }] }).content[0].name, long);
  assert.equal(new ToolNames().shorten(long), alias);
  assert.notEqual(names.shorten(long + '2'), alias);
  assert.equal(names.shorten('a'.repeat(64)), 'a'.repeat(64));
});

test('a tool named exactly like an alias cannot take it over', () => {
  // The alias is deterministic, so a tool can be declared with that name — by a
  // server that wants the other tool's calls, or by coincidence. Either way the
  // two cannot share one name upstream.
  const alias = new ToolNames().shorten(long);
  assert.ok(alias.length <= 64, 'an alias is short enough to be a legal tool name');
  for (const tools of [[{ name: alias }, { name: long }], [{ name: long }, { name: alias }]]) {
    assert.throws(() => new ToolNames().request({ tools }), /collision/i);
  }
  // A short name that collides with nothing is still passed through untouched,
  // and declaring the same tool twice is not a collision.
  const names = new ToolNames();
  assert.deepEqual(
    names.request({ tools: [{ name: 'read' }, { name: 'read' }] }).tools.map(t => t.name),
    ['read', 'read']
  );
  assert.equal(names.restore('read'), 'read');
});

test('SSE event names restore, tool arguments remain untouched', () => {
  const names = new ToolNames();
  const alias = names.shorten(long);
  const frame = 'event: content_block_start\r\ndata: ' + JSON.stringify({ type: 'content_block_start', content_block: { type: 'tool_use', name: alias, input: {} } });
  assert.ok(sseFrame(frame, names).includes(long));
  const delta = 'data: ' + JSON.stringify({ type: 'content_block_delta', delta: { partial_json: alias } });
  assert.equal(sseFrame(delta, names), delta);
  assert.equal(sseFrame('data: [DONE]', names), 'data: [DONE]');
});

test('HTTP authentication, request mapping, fragmented UTF-8 SSE, and error status', async () => {
  let received;
  const upstream = http.createServer(async (req, res) => {
    assert.equal(req.headers.authorization, 'Bearer upstream-test-key');
    if (req.url.endsWith('/error')) { res.writeHead(429, { 'content-type': 'application/json' }); res.end('{"error":{"message":"rate limited"}}'); return; }
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    received = JSON.parse(Buffer.concat(chunks));
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    const data = Buffer.from('event: content_block_start\r\ndata: ' + JSON.stringify({ content_block: { type: 'tool_use', name: received.tools[0].name, input: {} }, note: 'Привет' }) + '\r\n\r\n');
    for (const byte of data) res.write(Buffer.from([byte]));
    res.end();
  });
  await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
  const proxy = await startProxy('http://127.0.0.1:' + upstream.address().port, 'upstream-test-key');
  try {
    assert.equal((await fetch(proxy.url + '/v1/messages')).status, 401);
    const headers = { authorization: 'Bearer ' + proxy.token, 'content-type': 'application/json' };
    const response = await fetch(proxy.url + '/v1/messages', { method: 'POST', headers, body: JSON.stringify({ tools: [{ name: long }] }) });
    const text = await response.text();
    assert.equal(response.status, 200);
    assert.ok(received.tools[0].name.length <= 64);
    assert.ok(text.includes(long));
    assert.ok(text.includes('Привет'));
    const error = await fetch(proxy.url + '/v1/error', { headers });
    assert.equal(error.status, 429);
    assert.equal((await error.json()).error.message, 'rate limited');
  } finally {
    proxy.server.closeAllConnections(); proxy.server.close();
    upstream.closeAllConnections(); upstream.close();
  }
});

test('stop_sequences never reaches the provider', async () => {
  let received;
  const upstream = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    received = JSON.parse(Buffer.concat(chunks));
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end('{"type":"message"}');
  });
  await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
  const proxy = await startProxy('http://127.0.0.1:' + upstream.address().port, 'upstream-test-key');
  try {
    const response = await fetch(proxy.url + '/v1/messages', {
      method: 'POST',
      headers: { authorization: 'Bearer ' + proxy.token, 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'm', stop_sequences: ['</verdict>'], messages: [{ content: 'hi' }] }),
    });
    assert.equal(response.status, 200);
    // Asserted on the body the provider received, not on the helper alone: a
    // helper that works but is never called is the failure this guards against.
    assert.equal('stop_sequences' in received, false);
    assert.deepEqual(received.messages, [{ content: 'hi' }]);
    assert.equal(received.model, 'm');
  } finally {
    proxy.server.closeAllConnections(); proxy.server.close();
    upstream.closeAllConnections(); upstream.close();
  }
});

test('the debug log names an upstream failure and never the credential', async () => {
  const upstream = http.createServer(async (req, res) => {
    for await (const chunk of req) void chunk;
    // Not JSON, and not from the provider at all: a gateway standing in front of
    // it, quoting the whole request back. This is the second of the two branches
    // that log a failure, and it is reached by content type, so it needs a reply
    // of its own to be exercised.
    if (req.url === '/v1/gateway') {
      res.writeHead(502, { 'content-type': 'text/html' });
      res.end('<html>refused Bearer upstream-test-key carrying the-content-of-a-turn</html>');
      return;
    }
    // The parameters are the provider's to write, and this one puts the
    // credential it rejected in them. The header never reaches the log, so the
    // assertion below that the key is absent covers this branch too.
    res.writeHead(400, { 'content-type': 'application/json; charset=utf-8; note=upstream-test-key' });
    // Written the way a provider that quotes what it refused writes one: the
    // sentence worth keeping, and beside it the request and the authorization
    // it just rejected. Nothing stops an upstream from replying like this, so
    // the log has to survive it.
    res.end(JSON.stringify({
      error: { message: '`stop_sequences` is not supported' },
      request: { messages: [{ content: 'the-content-of-a-turn' }] },
      authorization: 'Bearer upstream-test-key',
    }));
  });
  await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
  const file = path.join(os.tmpdir(), 'muse-debug-' + process.pid + '.log');
  fs.rmSync(file, { force: true });
  process.env.MUSE_DEBUG_LOG = file;
  const proxy = await startProxy('http://127.0.0.1:' + upstream.address().port, 'upstream-test-key');
  try {
    // Deliberately not ASCII. The decoded string is shorter than the body that
    // travelled, so a count taken from it is wrong in exactly the direction
    // that matters.
    const sent = JSON.stringify({ model: 'm', messages: [{ role: 'user', content: 'Привет, 世界' }] });
    assert.ok(Buffer.byteLength(sent, 'utf8') > sent.length);
    await fetch(proxy.url + '/v1/messages', {
      method: 'POST',
      headers: { authorization: 'Bearer ' + proxy.token, 'content-type': 'application/json' },
      body: sent,
    });
    await fetch(proxy.url + '/v1/gateway', {
      headers: { authorization: 'Bearer ' + proxy.token },
    });
    const log = fs.readFileSync(file, 'utf8');
    assert.match(log, /"event":"request"/);
    assert.match(log, /"event":"upstream_error"/);
    // The field that was refused is still there to read, which is what the log
    // is for.
    assert.match(log, /stop_sequences/);
    // Both failures were recorded, and neither carried the body that named
    // them. Asserted on the file as a whole: a leak through either branch is
    // the same leak.
    assert.equal(log.match(/"event":"upstream_error"/g).length, 2);
    assert.match(log, /"status":502[^\n]*"unrecognized":true/);
    assert.match(log, new RegExp('"bytes":' + Buffer.byteLength(sent, 'utf8') + '[,}]'));
    assert.equal(log.includes('upstream-test-key'), false);
    assert.equal(log.includes('the-content-of-a-turn'), false);
    // The body was counted, never copied.
    assert.equal(log.includes('Привет'), false);
  } finally {
    delete process.env.MUSE_DEBUG_LOG;
    fs.rmSync(file, { force: true });
    proxy.server.closeAllConnections(); proxy.server.close();
    upstream.closeAllConnections(); upstream.close();
  }
});

test('an upstream error reaches the log by what it declares, never by its body', () => {
  const summary = errorSummary(JSON.stringify({
    error: { type: 'invalid_request_error', message: '`stop_sequences` is not supported' },
    request: { messages: [{ content: 'the content of a turn' }] },
  }));
  assert.equal(summary.type, 'invalid_request_error');
  assert.equal(summary.message, '`stop_sequences` is not supported');
  // The sentence that names the field is kept; everything standing next to it
  // in the same body is not. Asserted over the whole entry, because a field
  // added later would carry the leak back in without failing a narrower check.
  assert.equal(JSON.stringify(summary).includes('the content of a turn'), false);

  // A gateway in front of the provider states the same two fields at the top
  // level of the body rather than under `error`.
  const gateway = '{"type":"rate_limit_error","message":"slow down"}';
  assert.deepEqual(
    errorSummary(gateway),
    { bytes: Buffer.byteLength(gateway, 'utf8'), type: 'rate_limit_error', message: 'slow down' }
  );

  // A credential echoed back is struck out by value, which works wherever in
  // the sentence the provider chose to put it.
  const echoed = errorSummary('{"message":"Bearer upstream-key-value was rejected"}', ['upstream-key-value']);
  assert.equal(echoed.message, 'Bearer [redacted] was rejected');

  // A credential is a credential at any length: nothing validates how long a
  // configured token is, so a guarantee that held only above some length would
  // hold for some keys and not others.
  assert.equal(errorSummary('{"message":"key abc rejected"}', ['abc']).message, 'key [redacted] rejected');
  // The empty string is the one value that cannot be searched for - splitting on
  // it would return the text one character at a time. It leaves the text alone.
  assert.equal(errorSummary('{"message":"hello"}', ['']).message, 'hello');
});

test('a long message is redacted before it is capped, and an unfamiliar body is measured', () => {
  const long = errorSummary(JSON.stringify({ error: { message: 'x'.repeat(400) + 'the tail of a turn' } }));
  assert.equal(long.message.length, 300);
  assert.equal(long.truncated, true);
  assert.equal(long.message.includes('the tail of a turn'), false);

  // The credential lies across the 300-character cap. Cut first, its tail goes
  // with the cut, the exact-match search finds nothing, and the head of the
  // token stays in the log - the cap defeating the redaction.
  const secret = 'sk-' + 'a'.repeat(40);
  const straddling = errorSummary(
    JSON.stringify({ error: { message: 'x'.repeat(290) + secret + ' was rejected' } }),
    [secret]
  );
  assert.equal(straddling.message.includes('sk-'), false);
  assert.equal(straddling.message, 'x'.repeat(290) + '[redacted]');
  assert.equal(straddling.truncated, true);

  // Redaction shortens the text, so a message over the cap before scrubbing can
  // fit under it after - and then nothing was cut. `truncated` describes the
  // sentence in the log, not the one that arrived.
  const shortened = errorSummary(
    JSON.stringify({ error: { message: 'x'.repeat(267) + secret } }),
    [secret]
  );
  assert.equal(shortened.message, 'x'.repeat(267) + '[redacted]');
  assert.equal('truncated' in shortened, false);

  // A type is a string the provider chooses too, so it is bounded as well.
  const shouting = errorSummary(JSON.stringify({ error: { type: 'e'.repeat(400) } }));
  assert.equal(shouting.type.length, 300);

  // A gateway's HTML page declares nothing this can read. It is still worth an
  // entry - "refused, and said something unreadable" is not "nothing came
  // back" - but it is recorded by size, not by content.
  const page = '<html><body>token=abc, prompt was: the content of a turn</body></html>';
  const unfamiliar = errorSummary(page);
  assert.deepEqual(unfamiliar, { bytes: Buffer.byteLength(page, 'utf8'), unrecognized: true });
});

test('a malformed body is reported by name, never by an excerpt of itself', () => {
  assert.deepEqual(parseJson('{"a":1}', 'The request body'), { a: 1 });
  // `JSON.parse` puts a window of its input into the SyntaxError it throws, and
  // for these bodies that window is the content of a turn. The message this
  // raises instead is fixed, so nothing of the body can travel in it.
  assert.throws(
    () => parseJson('{"messages":[{"content":"the content of a turn"}], "model": bad}', 'The request body'),
    error => error.message === 'The request body is not valid JSON'
  );
});

test('a debug log that cannot be written says so once and does not break the turn', async () => {
  const upstream = http.createServer(async (req, res) => {
    for await (const chunk of req) void chunk;
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end('{"ok":true}');
  });
  await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
  // A directory that does not exist, which is what `--muse-debug=<path>` names
  // when a user mistypes it or points at a drive that is not mounted.
  process.env.MUSE_DEBUG_LOG = path.join(os.tmpdir(), 'muse-absent-' + process.pid, 'nested', 'x.log');
  const said = [];
  const spoke = console.error;
  console.error = message => said.push(String(message));
  const proxy = await startProxy('http://127.0.0.1:' + upstream.address().port, 'upstream-test-key');
  try {
    for (let i = 0; i < 2; i++) {
      const response = await fetch(proxy.url + '/v1/messages', {
        method: 'POST',
        headers: { authorization: 'Bearer ' + proxy.token, 'content-type': 'application/json' },
        body: JSON.stringify({ model: 'm', messages: [] }),
      });
      // The turn is what matters. A log that cannot be written must not cost
      // the request it was turned on to explain.
      assert.equal(response.status, 200);
    }
  } finally {
    console.error = spoke;
    delete process.env.MUSE_DEBUG_LOG;
    proxy.server.closeAllConnections(); proxy.server.close();
    upstream.closeAllConnections(); upstream.close();
  }
  // Two requests, three log attempts each, one sentence. Silence here is the
  // bug: the launcher announced a path the user would have watched all session.
  assert.equal(said.length, 1);
  assert.match(said[0], /cannot write the request log/);
  assert.match(said[0], /ENOENT/);
});

test('an error inside a streaming reply is logged, not read as a success', async () => {
  const upstream = http.createServer(async (req, res) => {
    for await (const chunk of req) void chunk;
    // 200, then a failure. The status line was already committed when the
    // provider found out how the turn ends.
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.write('event: message_start\ndata: {"type":"message_start"}\n\n');
    res.end('event: error\ndata: {"type":"error","error":{"type":"overloaded_error","message":"upstream is overloaded"}}\n\n');
  });
  await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
  const file = path.join(os.tmpdir(), 'muse-stream-' + process.pid + '.log');
  fs.rmSync(file, { force: true });
  process.env.MUSE_DEBUG_LOG = file;
  const proxy = await startProxy('http://127.0.0.1:' + upstream.address().port, 'upstream-test-key');
  try {
    const response = await fetch(proxy.url + '/v1/messages', {
      method: 'POST',
      headers: { authorization: 'Bearer ' + proxy.token, 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'm', stream: true, messages: [] }),
    });
    // Forwarded untouched: the client is the one that has to act on it.
    assert.ok((await response.text()).includes('overloaded_error'));
    const log = fs.readFileSync(file, 'utf8');
    // The 200 is still recorded, and the failure sits beside it contradicting
    // it. Without the second line the turn reads as having worked.
    assert.match(log, /"event":"response","status":200/);
    assert.match(log, /"event":"upstream_error","status":200,"stream":true/);
    assert.match(log, /"type":"overloaded_error"/);
    assert.match(log, /upstream is overloaded/);
  } finally {
    delete process.env.MUSE_DEBUG_LOG;
    fs.rmSync(file, { force: true });
    proxy.server.closeAllConnections(); proxy.server.close();
    upstream.closeAllConnections(); upstream.close();
  }
});

test('the logged content type is a media type and nothing else', () => {
  assert.equal(mediaType('application/json'), 'application/json');
  assert.equal(mediaType('text/event-stream; charset=utf-8'), 'text/event-stream');
  assert.equal(mediaType('APPLICATION/JSON'), 'application/json');
  assert.equal(mediaType('application/vnd.api+json'), 'application/vnd.api+json');
  // A header is written upstream, and the parameters are where anything can be
  // put. They are dropped rather than trusted.
  assert.equal(mediaType('application/json; key=LLM|123|secret'), 'application/json');
  // A value that is not a media type is not quoted in its place. `null` still
  // separates "the reply declared something unreadable" from "no reply".
  assert.equal(mediaType('Bearer LLM|123|secret'), null);
  assert.equal(mediaType('application/json LLM|123|secret'), null);
  assert.equal(mediaType(null), null);
});

test('an adapter error never carries a credential out of the configured URL', async () => {
  const file = path.join(os.tmpdir(), 'muse-adapter-' + process.pid + '.log');
  fs.rmSync(file, { force: true });
  process.env.MUSE_DEBUG_LOG = file;
  // A gateway written with userinfo. `fetch` refuses the URL and says so by
  // quoting the whole of it, so this is not a rare path - it is every request
  // this configuration ever makes.
  // The long path is deliberate: the message quotes the URL, so it is what
  // makes this error long enough to prove the cap holds here too.
  const proxy = await startProxy('https://muse-user:muse-password@127.0.0.1:1/v1/' + 'p'.repeat(400), 'upstream-test-key');
  try {
    const response = await fetch(proxy.url + '/v1/messages', {
      method: 'POST',
      headers: { authorization: 'Bearer ' + proxy.token, 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'm', messages: [] }),
    });
    assert.equal(response.status, 502);
    const log = fs.readFileSync(file, 'utf8');
    // The fault is still named - that is what the entry is for.
    assert.match(log, /"event":"adapter_error"/);
    assert.match(log, /\[redacted\]/);
    assert.equal(log.includes('muse-password'), false);
    assert.equal(log.includes('muse-user'), false);
    // Bounded like every other provider-written string that reaches the log.
    const entry = JSON.parse(log.split('\n').find(line => line.includes('"adapter_error"')));
    assert.equal(entry.message.length, 300);
  } finally {
    delete process.env.MUSE_DEBUG_LOG;
    fs.rmSync(file, { force: true });
    proxy.server.closeAllConnections(); proxy.server.close();
  }
});

test('an ordinary streaming frame is not mistaken for a failure', () => {
  assert.equal(sseError('event: message_start\ndata: {"type":"message_start"}'), null);
  assert.equal(sseError('data: [DONE]'), null);
  // A frame this cannot read belongs to `sseFrame` to report; a diagnostic must
  // not be what ends a stream.
  assert.equal(sseError('data: {not json'), null);
  assert.equal(
    sseError('event: error\ndata: {"type":"error","error":{"message":"gone"}}'),
    '{"type":"error","error":{"message":"gone"}}'
  );
});

test('cache_control keeps only its type, everywhere it can appear', () => {
  const body = plainCacheControl({
    system: [{ type: 'text', text: 'a', cache_control: { type: 'ephemeral', ttl: '1h' } }],
    tools: [{ name: 'x', cache_control: { type: 'ephemeral', ttl: '1h', scope: 'global' } }],
    messages: [{ content: [
      { type: 'text', text: 'b', cache_control: { type: 'ephemeral' } },
      { type: 'tool_result', content: [{ type: 'text', text: 'c', cache_control: { type: 'ephemeral', ttl: '5m' } }] },
    ] }],
    ttl: 'not a cache_control field',
  });
  assert.deepEqual(body.system[0].cache_control, { type: 'ephemeral' });
  assert.deepEqual(body.tools[0].cache_control, { type: 'ephemeral' });
  assert.deepEqual(body.messages[0].content[0].cache_control, { type: 'ephemeral' });
  assert.deepEqual(body.messages[0].content[1].content[0].cache_control, { type: 'ephemeral' });
  assert.equal(body.ttl, 'not a cache_control field');
  assert.equal(body.system[0].text, 'a');
  assert.deepEqual(plainCacheControl({ cache_control: null }), { cache_control: null });
});

test('a tool that has a cache_control of its own keeps it', () => {
  // An MCP tool is free to take an argument called cache_control. Its schema and
  // the inputs of past calls are the tool's data, not protocol metadata: rewrite
  // them and the model is handed a tool description that no longer matches the
  // tool.
  const schema = {
    type: 'object',
    properties: {
      cache_control: { type: 'object', description: 'passed through to the API', properties: { ttl: { type: 'string' } } },
    },
    required: ['cache_control'],
  };
  // Compared against a copy taken now: the function mutates in place, so
  // asserting against `schema` itself would pass however badly it was mangled.
  const untouched = JSON.parse(JSON.stringify(schema));
  const body = plainCacheControl({
    tools: [{ name: 'anthropic_request', input_schema: schema, cache_control: { type: 'ephemeral', ttl: '1h' } }],
    messages: [{ content: [
      { type: 'tool_use', name: 'anthropic_request', input: { cache_control: { type: 'ephemeral', ttl: '1h', note: 'kept' } } },
      { type: 'tool_result', content: [{ type: 'text', text: 'ok' }] },
    ] }],
  });
  // The tool definition's own cache_control is protocol metadata and is reduced.
  assert.deepEqual(body.tools[0].cache_control, { type: 'ephemeral' });
  // Everything below it is not.
  assert.deepEqual(body.tools[0].input_schema, untouched);
  assert.deepEqual(body.messages[0].content[0].input.cache_control, { type: 'ephemeral', ttl: '1h', note: 'kept' });
});

test('web_search keeps only the fields Meta accepts; domain filters are refused', () => {
  const body = webSearchTools({
    tools: [
      { type: 'web_search_20250305', name: 'web_search', max_uses: 9, user_location: { type: 'approximate' }, cache_control: { type: 'ephemeral' } },
      { name: 'Read', input_schema: { type: 'object' }, max_uses: 3 },
    ],
  });
  assert.deepEqual(Object.keys(body.tools[0]).sort(), ['cache_control', 'name', 'type', 'user_location']);
  // An ordinary client tool is never touched, whatever fields it carries.
  assert.equal(body.tools[1].max_uses, 3);
  for (const field of ['allowed_domains', 'blocked_domains']) {
    assert.throws(
      () => webSearchTools({ tools: [{ type: 'web_search_20250305', name: 'web_search', [field]: ['example.com'] }] }),
      error => error instanceof UnsupportedRequest && error.message.includes(field)
    );
  }
});

test('a Unicode-property pattern is dropped from a tool schema, and nothing else is', () => {
  // The pattern Claude Code 2.1.266 puts on Artifact's `field` argument, taken
  // off the wire. In the CLI it is a regex literal carrying the `u` flag that
  // gives \p{Cc} its meaning; a JSON Schema `pattern` is a bare string with no
  // flags, so what reaches the provider is a regex it refuses to compile.
  const artifact = '^(?!__.*__$)[^\\p{Cc}\\p{Cf}\\p{Zl}\\p{Zp}"\\\\./[\\]]{1,200}$';
  const plain = '^[a-z0-9_-]+$';
  const body = portableSchemas({
    tools: [
      { name: 'Artifact', input_schema: { type: 'object', $defs: { id: { type: 'string', pattern: '^\\p{Nd}{4}$' } }, properties: {
        field: { type: 'string', description: 'kept', pattern: artifact },
        collection: { type: 'string', pattern: plain },
        doc: { anyOf: [{ type: 'string', pattern: '\\p{L}+' }, { type: 'string', pattern: plain }] },
        rows: { items: { type: 'string', pattern: '\\P{N}' } },
      } } },
      { name: 'Read' },
      { type: 'web_search_20250305', name: 'web_search' },
    ],
    messages: [{ content: [{ type: 'tool_use', name: 'Artifact', input: { pattern: '\\p{L}' } }] }],
  });
  const schema = body.tools[0].input_schema;
  assert.ok(!('pattern' in schema.properties.field));
  assert.equal(schema.properties.doc.anyOf[0].pattern, undefined);
  assert.equal(schema.properties.rows.items.pattern, undefined);
  assert.equal(schema.$defs.id.pattern, undefined);
  // A pattern the provider can compile is a useful constraint and stays.
  assert.equal(schema.properties.collection.pattern, plain);
  assert.equal(schema.properties.doc.anyOf[1].pattern, plain);
  // Only the constraint goes. The property it constrained, and everything the
  // model reads to decide how to call the tool, are left exactly as they were.
  assert.equal(schema.properties.field.type, 'string');
  assert.equal(schema.properties.field.description, 'kept');
  // Tool definitions only. A past call's arguments are the conversation, and a
  // tool is free to take an argument of its own called `pattern`.
  assert.equal(body.messages[0].content[0].input.pattern, '\\p{L}');
});

test('a pattern that is a value rather than a constraint is left alone', () => {
  // `const`, `default`, `enum` and `examples` hold arbitrary JSON, not
  // subschemas. An object inside one of them may have a member named `pattern`,
  // and deleting it would change a value the tool receives instead of a
  // constraint the provider enforces.
  const body = portableSchemas({ tools: [{ name: 'Grep', input_schema: {
    type: 'object',
    properties: {
      rule: { type: 'object', default: { pattern: '\\p{L}+' }, const: { pattern: '\\p{M}' } },
      mode: { enum: [{ pattern: '\\p{N}' }], examples: [{ pattern: '\\p{L}' }] },
    },
  } }] });
  const props = body.tools[0].input_schema.properties;
  assert.equal(props.rule.default.pattern, '\\p{L}+');
  assert.equal(props.rule.const.pattern, '\\p{M}');
  assert.equal(props.mode.enum[0].pattern, '\\p{N}');
  assert.equal(props.mode.examples[0].pattern, '\\p{L}');
});

test('a tool argument named like a schema keyword is still a schema', () => {
  // `properties` and `$defs` map a name the tool chose to a subschema, and that
  // name is not a JSON Schema keyword. Reading an argument called `default` or
  // `enum` as the keyword of the same spelling would skip its schema and leave
  // the pattern in place, which is the 400 this transform exists to prevent.
  const body = portableSchemas({ tools: [{ name: 'X', input_schema: {
    type: 'object',
    $defs: { enum: { type: 'string', pattern: '\\p{Lu}' } },
    // draft-07 `dependencies` keys by property name too, and its values are a
    // subschema or a list of required property names.
    dependencies: { default: { properties: { x: { type: 'string', pattern: '\\p{S}' } } }, ok: ['y'] },
    properties: {
      default: { type: 'string', pattern: '\\p{L}+' },
      enum: { type: 'string', pattern: '\\p{N}+' },
      examples: { items: { type: 'string', pattern: '\\p{M}' } },
      // A property whose own name is a schema-map keyword is no different.
      properties: { type: 'string', pattern: '\\p{P}' },
    },
    // The same spellings one level up really are keywords, and hold values.
    default: { pattern: '\\p{L}' },
    enum: [{ pattern: '\\p{N}' }],
  } }] });
  const schema = body.tools[0].input_schema;
  assert.equal(schema.properties.default.pattern, undefined);
  assert.equal(schema.properties.enum.pattern, undefined);
  assert.equal(schema.properties.examples.items.pattern, undefined);
  assert.equal(schema.properties.properties.pattern, undefined);
  assert.equal(schema.$defs.enum.pattern, undefined);
  assert.equal(schema.dependencies.default.properties.x.pattern, undefined);
  assert.deepEqual(schema.dependencies.ok, ['y']);
  assert.equal(schema.default.pattern, '\\p{L}');
  assert.equal(schema.enum[0].pattern, '\\p{N}');
});

test('an unknown keyword is read as a schema; a named annotation is not', () => {
  // A keyword this walker has never heard of is walked as a schema. Guessing
  // wrong that way drops a constraint the provider was going to enforce and
  // widens what the request may carry; guessing wrong the other way leaves a
  // pattern the provider refuses, which ends every turn in the session. Only
  // the second is worth avoiding, so the unknown case is not left to a list of
  // schema-bearing keywords that would have to be complete to be safe.
  const body = portableSchemas({ tools: [{ name: 'X', input_schema: {
    type: 'object',
    // Values, by name and by the `x-` extension space. Left alone.
    example: { pattern: '\\p{L}+' },
    'x-vendor': { metadata: { pattern: '\\p{N}+' } },
    properties: {
      // `contentSchema` really is a subschema keyword, and this walker does
      // not list it. The catch-all is what keeps that from mattering.
      doc: { type: 'string', contentSchema: { type: 'string', pattern: '\\p{M}' } },
    },
  } }] });
  const schema = body.tools[0].input_schema;
  assert.equal(schema.example.pattern, '\\p{L}+');
  assert.equal(schema['x-vendor'].metadata.pattern, '\\p{N}+');
  assert.equal(schema.properties.doc.contentSchema.pattern, undefined);
});

test('a patternProperties key is a regex too, and is dropped or refused', () => {
  // The key of a `patternProperties` entry is itself a regular expression the
  // provider compiles, so the same escapes are fatal there and walking only
  // the values would leave the request refused for the same reason.
  const body = portableSchemas({ tools: [{ name: 'X', input_schema: {
    type: 'object',
    patternProperties: {
      '^\\p{L}+$': { type: 'string', pattern: '\\p{N}' },
      '^[a-z]+$': { type: 'string', pattern: '\\p{M}' },
    },
  } }] });
  const map = body.tools[0].input_schema.patternProperties;
  // The entry goes with its key: what it constrained becomes unconstrained,
  // which is a widening, and the properties it matched are still accepted.
  assert.deepEqual(Object.keys(map), ['^[a-z]+$']);
  // The surviving entry is still a schema and is still cleaned.
  assert.equal(map['^[a-z]+$'].pattern, undefined);
  assert.equal(map['^[a-z]+$'].type, 'string');
});

test('a patternProperties key cannot be dropped where additionalProperties would reject it', () => {
  // Removing the entry stops exempting the names it matched, so a restrictive
  // `additionalProperties` turns the widening into a narrowing: arguments the
  // tool declared valid would start being rejected. That is a change to what
  // the tool accepts, and it is not the adapter's to make silently.
  for (const additional of [false, { type: 'string' }]) {
    assert.throws(
      () => portableSchemas({ tools: [{ name: 'X', input_schema: {
        type: 'object',
        additionalProperties: additional,
        patternProperties: { '^\\p{L}+$': { type: 'string' } },
      } }] }),
      error => error instanceof UnsupportedRequest && error.message.includes('\\p{L}')
    );
  }
  // An open schema is the ordinary case and is widened rather than refused.
  const open = portableSchemas({ tools: [{ name: 'X', input_schema: {
    type: 'object',
    additionalProperties: true,
    patternProperties: { '^\\p{L}+$': { type: 'string' } },
  } }] });
  assert.deepEqual(open.tools[0].input_schema.patternProperties, {});
});

test('a pattern under an applicator that inverts is refused, not dropped', () => {
  // Dropping a constraint widens the schema it sits in, and that is what makes
  // dropping safe - but only where the schema around it is monotonic. Under
  // `not` the polarity reverses: `{not: {pattern: ...}}` becomes `{not: {}}`,
  // and the empty schema accepts everything, so the negation rejects
  // everything. `if` flips which branch applies, and widening one `oneOf`
  // branch can make two match and fail the whole. Those cannot be widened, so
  // they are refused with an explanation rather than silently narrowed.
  const under = shape => ({ tools: [{ name: 'X', input_schema: { type: 'object', properties: { s: shape } } }] });
  for (const shape of [
    { not: { pattern: '\\p{L}+' } },
    { if: { pattern: '\\p{L}+' }, then: { minLength: 2 } },
    { oneOf: [{ pattern: '\\p{L}+' }, { type: 'number' }] },
    // Depth does not restore the guarantee: still inside the negation.
    { not: { properties: { t: { items: { pattern: '\\p{L}+' } } } } },
  ]) {
    assert.throws(
      () => portableSchemas(under(shape)),
      error => error instanceof UnsupportedRequest && /not|if|oneOf/.test(error.message)
    );
  }
});

test('the applicators that preserve widening still drop', () => {
  // `allOf`, `anyOf`, `then`, `else`, `contains` and `propertyNames` all get
  // weaker when a subschema does, so the guarantee holds under them.
  const body = portableSchemas({ tools: [{ name: 'X', input_schema: {
    type: 'object',
    allOf: [{ pattern: '\\p{L}' }],
    anyOf: [{ pattern: '\\p{N}' }],
    contains: { pattern: '\\p{M}' },
    propertyNames: { pattern: '\\p{P}' },
    if: { type: 'string' },
    then: { pattern: '\\p{S}' },
    else: { pattern: '\\p{Z}' },
  } }] });
  const s = body.tools[0].input_schema;
  for (const at of [s.allOf[0], s.anyOf[0], s.contains, s.propertyNames, s.then, s.else]) {
    assert.equal(at.pattern, undefined);
  }
});

test('a patternProperties entry sealed by unevaluatedProperties is refused', () => {
  // `unevaluatedProperties: false` rejects what no keyword marked evaluated,
  // and matching a `patternProperties` key is what marked those names. Delete
  // the entry and they become unevaluated, so the schema narrows exactly as it
  // does under a restrictive `additionalProperties` - and this one reaches
  // down from an enclosing schema as well.
  const sealed = { tools: [{ name: 'X', input_schema: {
    type: 'object',
    unevaluatedProperties: false,
    patternProperties: { '^\\p{L}+$': { type: 'string' } },
  } }] };
  assert.throws(() => portableSchemas(sealed), error => error instanceof UnsupportedRequest);

  const enclosing = { tools: [{ name: 'X', input_schema: {
    type: 'object',
    unevaluatedProperties: false,
    allOf: [{ patternProperties: { '^\\p{L}+$': { type: 'string' } } }],
  } }] };
  assert.throws(() => portableSchemas(enclosing), error => error instanceof UnsupportedRequest);

  // An open schema is untouched by the seal and is still widened.
  const open = portableSchemas({ tools: [{ name: 'X', input_schema: {
    type: 'object',
    unevaluatedProperties: true,
    patternProperties: { '^\\p{L}+$': { type: 'string' } },
  } }] });
  assert.deepEqual(open.tools[0].input_schema.patternProperties, {});
});

test('a body with no tools, and a tool with no schema, do not throw', () => {
  assert.deepEqual(portableSchemas({}), {});
  assert.deepEqual(portableSchemas({ tools: [] }), { tools: [] });
  assert.deepEqual(portableSchemas({ tools: [{ name: 'Read' }] }), { tools: [{ name: 'Read' }] });
  assert.equal(portableSchemas({ tools: [{ name: 'R', input_schema: null }] }).tools[0].input_schema, null);
  assert.equal(portableSchemas({ tools: [{ name: 'R', input_schema: { pattern: 5 } }] }).tools[0].input_schema.pattern, 5);
});

test('a name claimed by one request does not follow the next one', async () => {
  // The upstream echoes back the tool names it was given, so the test can see
  // what actually left the adapter.
  const upstream = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ tools: JSON.parse(Buffer.concat(chunks)).tools.map(tool => tool.name) }));
  });
  await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
  const proxy = await startProxy('http://127.0.0.1:' + upstream.address().port, 'upstream-test-key');
  const headers = { authorization: 'Bearer ' + proxy.token, 'content-type': 'application/json' };
  const send = tools => fetch(proxy.url + '/v1/messages', { method: 'POST', headers, body: JSON.stringify({ tools }) });
  try {
    const alias = new ToolNames().shorten(long);
    const first = await send([{ name: long }]);
    assert.equal(first.status, 200);
    assert.deepEqual((await first.json()).tools, [alias]);
    // A later turn with a different tool set, one of them named like the alias
    // the first turn used. Nothing in this request collides with anything in it.
    const second = await send([{ name: alias }]);
    assert.equal(second.status, 200, 'the earlier turn poisoned this one');
    assert.deepEqual((await second.json()).tools, [alias]);
  } finally {
    proxy.server.closeAllConnections(); proxy.server.close();
    upstream.closeAllConnections(); upstream.close();
  }
});

test('the request timer measures silence, not elapsed time', async () => {
  const upstream = http.createServer(async (req, res) => {
    for await (const chunk of req) void chunk;
    if (req.url.endsWith('/silent')) return;
    if (req.url.endsWith('/slowjson')) {
      res.writeHead(200, { 'content-type': 'application/json' });
      // 200 ms of body that is not parseable JSON until the last piece lands.
      for (const piece of ['{"type":', '"message"', ',"content"', ':[]', '}']) {
        await new Promise(resolve => setTimeout(resolve, 40));
        res.write(piece);
      }
      res.end();
      return;
    }
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    // Six frames 40 ms apart: 240 ms in total, well past the 150 ms idle limit,
    // with no gap longer than it.
    for (let i = 0; i < 6; i++) {
      await new Promise(resolve => setTimeout(resolve, 40));
      res.write('data: ' + JSON.stringify({ type: 'ping', i }) + '\n\n');
    }
    res.end();
  });
  await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
  const proxy = await startProxy('http://127.0.0.1:' + upstream.address().port, 'upstream-test-key', 0.15);
  const headers = { authorization: 'Bearer ' + proxy.token, 'content-type': 'application/json' };
  try {
    const started = Date.now();
    const streamed = await (await fetch(proxy.url + '/v1/messages', { method: 'POST', headers, body: '{}' })).text();
    assert.equal(streamed.match(/data: /g).length, 6);
    assert.ok(Date.now() - started > 150, 'the stream outlived the idle window');
    // A non-streaming body is buffered chunk by chunk, so it counts as activity too.
    const slow = await fetch(proxy.url + '/v1/slowjson', { method: 'POST', headers, body: '{}' });
    assert.equal(slow.status, 200);
    assert.deepEqual(await slow.json(), { type: 'message', content: [] });
    // A connection that goes quiet is still abandoned.
    const silent = await fetch(proxy.url + '/v1/silent', { method: 'POST', headers, body: '{}' });
    assert.equal(silent.status, 502);
  } finally {
    proxy.server.closeAllConnections(); proxy.server.close();
    upstream.closeAllConnections(); upstream.close();
  }
});

test('an upload that stalls mid-body is abandoned too', async () => {
  const upstream = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' }).end('{}');
  });
  await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
  const proxy = await startProxy('http://127.0.0.1:' + upstream.address().port, 'upstream-test-key', 0.15);
  const socket = net.connect(Number(new URL(proxy.url).port), '127.0.0.1');
  try {
    await once(socket, 'connect');
    // The headers promise 4096 bytes, two arrive, and the client then holds the
    // connection open without sending the rest or closing it.
    socket.write(
      'POST /v1/messages HTTP/1.1\r\nHost: 127.0.0.1\r\n' +
      'authorization: Bearer ' + proxy.token + '\r\n' +
      'content-type: application/json\r\ncontent-length: 4096\r\n\r\n{}'
    );
    const closed = await Promise.race([
      once(socket, 'close').then(() => true),
      new Promise(resolve => setTimeout(resolve, 2000, false)),
    ]);
    assert.ok(closed, 'the stalled upload was held open past the idle window');
  } finally {
    socket.destroy();
    proxy.server.closeAllConnections(); proxy.server.close();
    upstream.closeAllConnections(); upstream.close();
  }
});
```

Create `~/.local/lib/claude-muse/README.md` with this exact content. The block
is fenced with four backticks because the file itself contains fenced blocks;
everything up to the closing four-backtick line belongs in the file:

````markdown
# Claude Muse compatibility adapter

`claude-muse` starts `launcher.cjs`, which reads the private provider
configuration, prepares a clean environment, starts the local adapter, and
launches the normal `claude` program with your shared settings.

`launcher.cjs` holds everything platform-specific. `adapter.cjs` is a pure
library with no platform assumptions: the loopback proxy and the tool-name
mapping. The split is what lets one installation serve Linux, macOS, WSL and
native Windows from the same code.

## Runtime requirements

Node.js 18.8 or newer. The launcher closes the loopback proxy with
`server.closeAllConnections()`, added in Node 18.2.0, and the offline tests use
the `after` hook of `node:test`, added in Node 18.8.0.

Every path is resolved from `os.homedir()`. Under Git Bash or another MSYS shell
that is `%USERPROFILE%`, regardless of what the shell's `$HOME` says, which is
why the installer put these files under the Node-reported home.

## Tool-name aliasing

Meta rejects tool names longer than 64 characters. Installed Chrome DevTools
and Notion tools can exceed that limit because Claude Code prefixes their names.
The adapter replaces long names with deterministic, readable hashed aliases
in tool definitions, tool choices, history, and tool references. It restores
the original names in JSON and streaming responses before Claude Code sees them.
Tool inputs, schemas, and text are not rewritten by the aliasing. One other
transform reaches into tool schemas, and only to drop a constraint the provider
cannot compile; see *Regex patterns in tool schemas* below.

## Web search

Meta's `web_search_20250305` accepts only `type`, `name`, `user_location` and
`cache_control`. Claude Code always sends `max_uses` too, so without this
adapter every WebSearch call fails with `400 web_search field "max_uses" is not
supported` and the model quietly answers from memory instead. The adapter drops
`max_uses`; the provider applies its own cap.

`allowed_domains` and `blocked_domains` are rejected by Meta as well, and the
adapter does not drop those. They are a restriction you configured, and a
search without them would reach domains you excluded on purpose, so such a
request is refused locally with an explanation. Remove the domain filter from
your Claude Code settings, or turn the WebSearch tool off.

Page fetching happens inside Meta's own search tool. The separate
`web_fetch_20250910` tool type is not supported by the provider.

## Regex patterns in tool schemas

Meta compiles every JSON Schema `pattern` a tool declares with a strict
ECMA-262 validator, and refuses the whole request when one of them does not
parse. Claude Code 2.1.266 ships one that does not: the Artifact tool
constrains its `field` argument with `\p{Cc}` and friends. Those are Unicode
property escapes, and in the CLI they sit in a regex literal carrying the `u`
flag that gives them a meaning. A `pattern` is a bare string and carries no
flags, so what arrives upstream is a regex the provider cannot compile.

One bad schema among the whole set is enough to end every turn, so the symptom
is that nothing works at all rather than that one tool is broken. The adapter
removes any `pattern` containing `\p{` or `\P{` from `tools[].input_schema`,
and leaves every other pattern in place. Only the constraint goes: `pattern`
tells the provider what to reject, not the model what to send, so the tool
description the model reads is unchanged and the tool still validates its own
arguments when the call arrives.

Dropping a constraint is safe because it widens the schema, and that is a
property of what surrounds the constraint. Under `not` the polarity reverses:
`{not: {pattern: ...}}` becomes `{not: {}}`, and an empty schema accepts
everything, so the negation rejects everything. `if` flips which branch
applies, and widening one `oneOf` branch can make two match and fail the whole.
A pattern beneath any of those is refused locally with an explanation rather
than dropped, because there dropping would reject arguments the tool declares
valid.

A `patternProperties` key is a regular expression as much as a `pattern` is,
and the provider compiles it the same way. There the whole entry goes, because
the key cannot be dropped without it: the names it matched become
unconstrained, and are still accepted. The exception is a schema whose
`additionalProperties` or `unevaluatedProperties` would then reject those
names, since matching a `patternProperties` key is what exempted them. Removing the entry would narrow
what the tool accepts rather than widen it, so that request is refused locally
with an explanation instead, the way a web search domain filter is.

Two things make this hard to recognise. The schema is behind a server-side
feature gate, so the same CLI build fails on one machine and works on another,
and the set of schemas sent can change with no update at all. And Claude Code
does not send the Artifact tool on a `-p` run, so a print-mode smoke test
passes while every interactive session dies. To see the failure on purpose, set
`CLAUDE_CODE_ARTIFACT=1` on a `-p` run.

If a future schema breaks in a way this transform does not cover, setting
`CLAUDE_CODE_ARTIFACT_DB_STR_REPLACE` to any value at all turns the offending
operation off without touching the adapter. It reads as a disable whatever it
is set to, including `true`, because the CLI compares the variable against the
boolean `true` and an environment variable is always a string. This is a
stopgap: it gives up a working feature to route around one bad pattern, and the
transform above is what closes the class.

## Auto mode

Claude Code's auto mode asks the model whether a tool call is safe before
running it, on a separate request that carries no tools and does not stream.
That request includes `stop_sequences`, which Meta rejects with HTTP 400, and
Claude Code renders the refusal as "the model is temporarily unavailable". The
symptom names nothing useful: Bash, Edit and Agent all fail while reading files
keeps working, because read-only tools are not gated. The adapter drops the
field, which costs where generation stops and buys a mode that would otherwise
never run at all.

## Diagnosing an unsupported field

Meta refuses one field at a time, and most of those refusals reach the user as
that same "temporarily unavailable" sentence, which names neither the request
nor the field. `claude-muse --muse-debug` turns on a request log for one run and
prints the path it is writing to; `--muse-debug=<path>` chooses the file, and
`MUSE_DEBUG_LOG` in the environment does the same thing for a session that is
already scripted.

The flag is namespaced rather than plain `--debug` because Claude Code has a
`--debug` of its own, and taking that name here would remove a flag from the
program this launcher exists to run. The launcher strips its own flag from the
arguments; everything else passes through untouched.

Each line of the log is one JSON object: the shape of a request (model, whether
it streams, how many tools, the longest tool name), the status of the reply, the
`type` and `message` a failing reply declares about itself, and any request the
proxy turned away before forwarding it. Headers, the key and the content of
messages are never written.

An error body is never copied, which is what keeps that last sentence true. A
provider is free to quote the request it objected to, or the authorization it
just rejected, and a body copied whole would carry both into the log. Only those
two declared fields are lifted out, capped at 300 characters, and scrubbed of
every credential the process holds; a body shaped like anything else — a
gateway's HTML page, say — is recorded by size alone. That is still enough to
name an unsupported field, which is what the log is for.

A streaming reply is recorded the same way. The provider commits to its status
line before it knows how the turn ends, so a 200 can open a stream and then
carry `event: error` - overloaded, context too long, refused. That failure is
logged beside the 200 rather than left to contradict nothing.

The file is created `0600`, and the name the flag generates when given no path
carries random bytes as well as a timestamp: the default lands in a directory
every account on the machine can write to, where a predictable name is one
another account can leave a symlink under. A generated name is claimed
exclusively, so one already taken stops the run instead of being appended to. A
path you name yourself is yours - it is appended to, and keeps the rights it
has.

With neither the flag nor the variable, nothing is logged and no file is opened.

Three of the four provider incompatibilities in this document were found this
way rather than predicted, so reach for the log first when a tool stops working,
not last.

## Long turns

The adapter gives up on a request after `MUSE_IDLE_TIMEOUT_SECONDS` of complete
silence, 300 by default. It is an idle timer, not a wall clock: every byte in
either direction restarts it, so a high-effort turn over a large context can
stream for as long as it needs. A fixed cutoff would be worse than useless here
— once the response headers have gone out there is no way left to report an
error, so the turn would simply arrive truncated.

## Where the key lives

The provider key stays in `~/.config/claude-muse/provider.env`. `launcher.cjs`
reads that file as data and never executes it, so a key containing `|`, `&` or
a backtick is inert. The key is passed to the adapter in memory only: it is
placed in no environment variable, and the child Claude Code process receives a
random session token for the loopback port instead.

Each launch listens on a random loopback port protected by that session token.
Only the adapter forwards the real key to the configured Meta URL. No request
bodies or credentials are logged. The adapter shuts down with Claude Code.

`provider.env` is parsed tolerantly: a UTF-8 byte-order mark and CRLF line
endings, both of which Windows editors add, are accepted. Values may be bare or
wrapped in single or double quotes.

## File protection differs by platform

On Linux and macOS the launcher, the adapter directory and the configuration
directory are mode `700`, and `provider.env` is mode `600`. No other
non-root user on the machine can read the key.

**On Windows the key is less protected.** NTFS has no POSIX permission bits,
and this installation does not modify access-control lists. `provider.env`
inherits the access rights of your user profile directory, which means any
process running as you, any local administrator, and `SYSTEM` can read it.
That is weaker than mode `600` — treat the file as readable by anything with
administrator access to the machine. If you need more, break inheritance and
grant only your own account, for example:

```text
icacls "%USERPROFILE%\.config\claude-muse\provider.env" /inheritance:r /grant:r "%USERNAME%:(R,W)"
```

## Finding Claude Code on Windows

`child_process` cannot execute a `.cmd` shim without a shell, and passing your
arguments through `cmd.exe` would mean quoting them by hand. The launcher avoids
that entirely.

Claude Code is distributed as a native binary — the npm package's postinstall
copies it over `bin/claude.exe`, and on Windows the binary is literally named
`claude.exe`. So the launcher first looks for `claude.exe` or `claude.com` on
`PATH` and runs it directly. If only the npm shim is on `PATH`, it reads that
shim to find the program behind it, using the same expressions npm's own
`read-cmd-shim` uses. The shim normally names the `.exe`, which is then run
directly; if it names a `.js` entry point instead — an `--ignore-scripts`
install leaves `cli-wrapper.cjs` in place — that runs under the same Node.

Either way arguments are passed verbatim and no shell is involved. If neither
is found, the launcher stops with an explanation instead of guessing.

`claude-muse.cmd` uses the `endLocal & goto #_undefined_#` idiom that npm's
`cmd-shim` writes into every shim it generates, which stops `cmd.exe` from
asking "Terminate batch job (Y/N)?" on Ctrl+C. Inside the interactive session
Ctrl+C is handled by Claude Code itself, because its terminal input is in raw
mode.

## Prompt caching is pinned to the provider default

Meta rejects `cache_control.ttl: 1h` with HTTP 400. Claude Code asks for the
1-hour cache only when it believes it is signed in to a Claude subscription —
and it believes that here, because this installation deliberately preserves the
shared `~/.claude`, which holds those credentials. The provider the request
actually goes to is not part of that decision.

This bites in interactive sessions and not in `claude-muse -p ...` runs: the
extended cache is limited to a few request scopes, and the main interactive
thread is one of them while a one-shot print run is not. An install that was
only ever verified with `-p` looks healthy and fails on first real use.

Two layers handle it. The launcher sets `FORCE_PROMPT_CACHING_5M=1`, which is
the first thing Claude Code checks and overrides environment variables,
settings and agent frontmatter alike. The adapter then reduces every
`cache_control` object on the wire to `{"type":"ephemeral"}`, dropping the `ttl`
and `scope` extensions whatever the client decided. Prompt caching still works;
only the extended, Anthropic-specific variants are given up.

## Effort, tools and context

Muse starts at `high` effort. The launcher expresses this as a Claude Code
`--effort high` argument rather than `CLAUDE_CODE_EFFORT_LEVEL`, so `/effort`
can change the active session to `low`, `medium`, or `high`. Muse treats
`xhigh` as `high`, so the launcher does not advertise `xhigh_effort`.

Tool Search is disabled for Muse, and this adapter is the reason. `ToolSearch`
names the tool it wants inside a tool input, and the adapter rewrites protocol
metadata only, so that name is never un-aliased. The model reads a real name in
the listing of deferred tools, which travels as message text; a tool whose
qualified name exceeds 64 characters is aliased everywhere the adapter does
rewrite, including the definition it is loaded under and the `tool_reference`
inside the search result. So the search the model issues for that alias comes
back `No matching deferred tools found`. A plain semantic query still returns
results, which is what makes the failure hard to read from inside a session.
Deferred loading also produced incorrect tool names and missing arguments in
integration tests. MCP servers remain enabled and their schemas are loaded
directly. This consumes more context than deferred loading. Qwen, ordinary
Claude, and global plugin/MCP configuration are unchanged.

The launcher declares a 1,048,576-token context window using
`CLAUDE_CODE_MAX_CONTEXT_TOKENS`, configured by `MUSE_MAX_CONTEXT_TOKENS` in
`provider.env`. For this non-Claude model ID, automatic compaction remains
enabled. Without this override Claude Code assumes 200K, which can trigger
repeated compaction with the full MCP schemas loaded.

## Local tests

```bash
cd "$(node -p 'require("os").homedir()')/.local/lib/claude-muse"
node --test adapter.test.cjs launcher.test.cjs
```

The home comes from Node rather than from `~` because this tree lives where
`os.homedir()` points. Under Git Bash those can be different directories, and
`~` would look in the one nothing was installed under.

Restart `claude-muse` after updating the adapter. Existing sessions keep the
adapter process they started with. Browser or MCP authentication failures are
separate from API tool-name validation; this adapter does not alter MCP servers.
````

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

There are forty-seven offline tests in total: thirty in `adapter.test.cjs` and
seventeen in `launcher.test.cjs`. All forty-seven must pass on both platforms;
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
