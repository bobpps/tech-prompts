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
└── prompt.md    the prompt text, ready to copy and paste verbatim
```

`prompt.md` contains the prompt and nothing else, so the whole file can be copied without
editing it first. Everything a human needs to know before running it lives in `README.md`.

## Prompts

| Prompt | What it does |
| --- | --- |
| [claude-muse-installer](claude-muse-installer/) | Installs a user-scoped `claude-muse` command that runs Claude Code against the Meta Model API on POSIX and native Windows, then verifies the install end to end. |

## Adding a prompt

1. Create a kebab-case directory named after the task.
2. Save the prompt verbatim as `prompt.md`.
3. Write `README.md`: what the prompt does, what it requires, what it changes on the machine,
   what it deliberately leaves alone, and how to run it.
4. Add a row to the table above.

Keep secrets out of prompt text. A prompt should tell the agent where the operator will put a
key, never carry one itself.
