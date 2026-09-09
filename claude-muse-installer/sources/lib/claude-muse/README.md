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
