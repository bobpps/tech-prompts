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
