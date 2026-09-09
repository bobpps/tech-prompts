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
