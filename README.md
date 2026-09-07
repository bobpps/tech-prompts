# tech-prompts

A collection of system and technical prompts: ready-to-paste instructions that make a coding
agent carry out a concrete engineering task end to end — installing tooling, configuring an
environment, wiring up a provider, running a migration.

Every prompt here is meant to be copied verbatim into an agent session. Nothing in this
repository runs by itself, and no prompt carries credentials.

## Layout

One directory per prompt:

```text
<prompt-name>/
├── README.md    what it does, requirements, how to run it, what to expect
├── prompt.md    the prompt text, ready to copy and paste verbatim
└── check.cjs    optional: verifies whatever in prompt.md can be verified
```

`prompt.md` contains the prompt and nothing else, so the whole file can be copied without
editing it first. Everything a human needs to know before running it lives in `README.md`.

## Checking a prompt

A prompt that dictates files to write, commands to run, or counts to quote can check itself. If
a directory contains `check.cjs`, CI runs it on every push and pull request, and you can run it
by hand:

```text
node claude-muse-installer/check.cjs
```

`claude-muse-installer` is the worked example: its checker extracts all eight files the prompt
dictates, parses the JavaScript, runs the prompt's own test suites, and compares the test counts
the prose quotes against the counts that actually ran. It has already caught a fenced block that
silently truncated a file to a third of its length. A checker verifies mechanism, never
intent — the prose still needs a reader.

## Prompts

| Prompt | What it does |
| --- | --- |
| [claude-muse-installer](claude-muse-installer/) | Installs a user-scoped `claude-muse` command that runs Claude Code against the Meta Model API on POSIX and native Windows, then verifies the install end to end. |

## Adding a prompt

1. Create a kebab-case directory named after the task.
2. Save the prompt verbatim as `prompt.md`.
3. Write `README.md`: what the prompt does, what it requires, what it changes on the machine,
   what it deliberately leaves alone, and how to run it.
4. Add `check.cjs` if the prompt contains anything a machine can check.
5. Add a row to the table above.

Keep secrets out of prompt text. A prompt should tell the agent where the operator will put a
key, never carry one itself.
