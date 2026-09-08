#!/usr/bin/env node
// Checks the executable part of prompt.md.
//
// The prompt tells an agent to write eight files verbatim, four of them running
// code. Nothing else verifies that those blocks can be extracted whole, that the
// code parses, that its own tests pass, or that the counts quoted in the prose
// still match. This does, offline and without an API key.
//
//   node claude-muse-installer/check.cjs [path/to/prompt.md]
//
// It cannot check the prose — the home-directory rule, the login-shell
// branches, the domain-filter policy — nor anything that needs the live
// provider. Those still need a reader.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const promptPath = process.argv[2] || path.join(__dirname, 'prompt.md');
const label = path.basename(promptPath);
const failures = [];
const notes = [];

const fail = message => failures.push(message);
const note = message => notes.push(message);

const NUMBERS = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
  eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50,
};

// ---------------------------------------------------------------- parse

const lines = fs.readFileSync(promptPath, 'utf8').split(/\r?\n/);

// Walks the document as CommonMark does: a fence closes at the first line whose
// run of backticks is at least as long as the one that opened it.
function readBlocks() {
  const blocks = [];
  for (let i = 0; i < lines.length; i++) {
    const open = lines[i].match(/^(`{3,})(.*)$/);
    if (!open) continue;
    const ticks = open[1];
    const info = open[2].trim();
    const body = [];
    let closedAt = -1;
    let closingInfo = '';
    for (let j = i + 1; j < lines.length; j++) {
      const close = lines[j].match(/^(`{3,})(.*)$/);
      if (close && close[1].length >= ticks.length) {
        closedAt = j;
        closingInfo = close[2].trim();
        break;
      }
      body.push(lines[j]);
    }
    if (closedAt === -1) {
      fail(`${label}:${i + 1} opens a fence that is never closed`);
      break;
    }
    blocks.push({ start: i, end: closedAt, ticks, info, closingInfo, body });
    i = closedAt;
  }
  return blocks;
}

// The paragraph immediately above a block, as one line, so wrapped sentences
// can be matched.
function introOf(block) {
  let i = block.start - 1;
  while (i >= 0 && !lines[i].trim()) i--;
  const collected = [];
  for (; i >= 0 && lines[i].trim(); i--) collected.unshift(lines[i]);
  return collected.join(' ').replace(/\s+/g, ' ');
}

const blocks = readBlocks();

// Blocks that declare a file: an intro naming a `~/…` path and promising exact
// content.
const declared = new Map();
for (const block of blocks) {
  const intro = introOf(block);
  if (!/exact\s+content/i.test(intro)) continue;
  const target = intro.match(/`(~\/[^`]+)`/);
  if (!target) {
    fail(`${label}:${block.start + 1} promises exact content but names no ~/ path`);
    continue;
  }
  if (declared.has(target[1])) fail(`${target[1]} is declared by more than one block`);
  declared.set(target[1], block);
}

// ---------------------------------------------------------------- structure

// A fence that closes a block never carries an info string. One that does was
// meant to open a nested block, and has silently ended its parent instead —
// which is how the installed README once lost two thirds of its length.
for (const block of blocks) {
  if (block.closingInfo) {
    fail(
      `${label}:${block.end + 1} closes the block opened at line ${block.start + 1} ` +
      `but carries the info string "${block.closingInfo}" — the outer block needs a longer fence`
    );
  }
}

for (const [target, block] of declared) {
  if (target.endsWith('.md') && block.ticks.length < 4) {
    fail(`the block for ${target} is a markdown file fenced with ${block.ticks.length} backticks; use at least four`);
  }
}

// The layout block lists what a finished install contains. It and the declared
// blocks have to agree, or the prompt promises a file it never spells out.
const layout = blocks.find(block => introOf(block).includes('The final installation consists of'));
if (!layout) {
  fail('the "final installation consists of" layout block is missing');
} else {
  const listed = layout.body
    .map(line => line.trim().split(/\s+/)[0])
    .filter(entry => entry.startsWith('~/'));
  for (const entry of listed) if (!declared.has(entry)) fail(`${entry} is listed in the layout but no block writes it`);
  for (const entry of declared.keys()) if (!listed.includes(entry)) fail(`${entry} is written by a block but missing from the layout`);
  note(`${listed.length} files listed in the layout, ${declared.size} written by blocks`);
}

// ---------------------------------------------------------------- run

const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-muse-check-'));
process.on('exit', () => fs.rmSync(workDir, { recursive: true, force: true }));

const written = new Map();
for (const [target, block] of declared) {
  const file = path.join(workDir, path.basename(target));
  fs.writeFileSync(file, block.body.join('\n') + '\n');
  written.set(path.basename(target), file);
}

function node(args) {
  return execFileSync(process.execPath, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

for (const [name, file] of written) {
  if (!name.endsWith('.cjs')) continue;
  try {
    node(['--check', file]);
  } catch (error) {
    fail(`${name} does not parse:\n${(error.stderr || error.message).trim()}`);
  }
}

// Node 23 changed the default reporter on a non-TTY stdout from `tap` to
// `spec`, so the summary arrives as `# pass 8` on an older runtime and
// `ℹ pass 8` on a newer one. Both are read here rather than pinning
// `--test-reporter=tap`, a flag that only exists from Node 18.15 and would fail
// on the oldest runtime this prompt supports.
function summary(output, field) {
  const match = output.match(new RegExp(`^(?:# |ℹ )${field} (\\d+)$`, 'm'));
  return match ? Number(match[1]) : -1;
}

// Each test file is run on its own so the per-file counts the prose quotes can
// be checked, not just the total.
const counts = new Map();
for (const [name, file] of written) {
  if (!name.endsWith('.test.cjs')) continue;
  let output;
  try {
    output = node(['--test', file]);
  } catch (error) {
    // Printed whole. Which lines carry the failure is reporter-specific, and a
    // filter that guesses wrong here reports a failing suite as an empty list.
    output = (error.stdout || '') + (error.stderr || '');
    fail(`${name} has failing tests:\n${output.trim()}`);
  }
  const passed = summary(output, 'pass');
  const failed = summary(output, 'fail');
  if (passed < 0 || failed < 0) fail(`could not read the test summary for ${name}`);
  else {
    counts.set(name, passed);
    note(`${name}: ${passed} passed, ${failed} failed`);
  }
}

// ---------------------------------------------------------------- prose

// "There are twenty-seven offline tests in total: twelve in `adapter.test.cjs` and
// fifteen in `launcher.test.cjs`." Prose that drifts from the code is how a
// reader stops trusting either.
// Hyphenated compounds are summed, so the sentence can keep spelling its
// numbers out past twenty as the suites grow.
function spelled(word) {
  const parts = word.toLowerCase().split('-');
  if (parts.some(part => NUMBERS[part] === undefined)) return undefined;
  return parts.reduce((sum, part) => sum + NUMBERS[part], 0);
}

const prose = lines.join(' ').replace(/\s+/g, ' ');
const claim = prose.match(
  /There are ([\w-]+) offline tests in total: ([\w-]+) in `([\w.]+)` and ([\w-]+) in `([\w.]+)`/
);
if (!claim) {
  fail('the sentence stating the offline test counts was not found');
} else {
  const total = spelled(claim[1]);
  const expected = [[claim[3], spelled(claim[2])], [claim[5], spelled(claim[4])]];
  for (const [name, want] of expected) {
    const got = counts.get(name);
    if (want === undefined) fail(`the prompt spells an unrecognised number for ${name}`);
    else if (got === undefined) fail(`the prompt counts tests in ${name}, which was never run`);
    else if (got !== want) fail(`the prompt says ${want} tests in ${name}; ${got} ran`);
  }
  const ran = [...counts.values()].reduce((sum, n) => sum + n, 0);
  if (total !== ran) fail(`the prompt says ${total} offline tests in total; ${ran} ran`);
}

// ---------------------------------------------------------------- readme

// The README states the same counts for a reader who never opens the prompt,
// and until now nothing compared the two. They drifted the first time the
// suites grew: the prompt said thirty and the README still said twenty-seven,
// so the two documents told a user to expect different numbers from the same
// install. Read from beside the prompt, and skipped when there is none, so the
// checker still runs against an extracted copy.
const readmePath = path.join(path.dirname(promptPath), 'README.md');
if (!fs.existsSync(readmePath)) {
  note('no README.md beside the prompt; its counts were not checked');
} else {
  const readme = fs.readFileSync(readmePath, 'utf8').replace(/\s+/g, ' ');
  const ran = [...counts.values()].reduce((sum, n) => sum + n, 0);

  const total = readme.match(/runs ([\w-]+) offline tests/);
  if (!total) fail('README.md states no total offline test count');
  else if (spelled(total[1]) !== ran) fail(`README.md says ${total[1]} offline tests in total; ${ran} ran`);

  // The layout block names each suite and how many tests it holds.
  const perSuite = [...readme.matchAll(/([\w.]+\.test\.cjs) +([\w-]+) offline tests/g)];
  for (const [, name, word] of perSuite) {
    const got = counts.get(name);
    if (got === undefined) fail(`README.md counts tests in ${name}, which was never run`);
    else if (spelled(word) !== got) fail(`README.md says ${word} tests in ${name}; ${got} ran`);
  }
  // Checked against the suites that ran, not against an empty match list. A
  // layout that lists one suite and drops the other agrees with itself, and a
  // reader following it installs a test file nothing told them to expect.
  const documented = new Set(perSuite.map(([, name]) => name));
  for (const name of counts.keys()) {
    if (!documented.has(name)) fail(`README.md's layout does not count ${name}`);
  }
}

// ---------------------------------------------------------------- report

for (const line of notes) console.log('  ' + line);
if (failures.length) {
  console.error('\n' + failures.length + ' problem' + (failures.length === 1 ? '' : 's') + ' in ' + promptPath + ':\n');
  for (const failure of failures) console.error('  - ' + failure);
  process.exitCode = 1;
} else {
  console.log('\nprompt.md checks out: every declared file extracts, parses, and passes its own tests.');
}
