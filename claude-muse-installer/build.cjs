#!/usr/bin/env node
// Renders prompt.md from prompt.template.md and sources/.
//
// The prompt is pasted verbatim into an agent session, so it has to carry every
// file it dictates. Keeping those files inside the markdown by hand made them
// awkward to read, impossible to lint, and easy to truncate: a block long
// enough to contain a fence of its own has to be opened with a longer one, and
// getting that wrong once cost the installed README two thirds of its length.
//
// So the files live in sources/, where they are ordinary code, and this script
// puts them back. Fence length is computed, never chosen.
//
//   node claude-muse-installer/build.cjs            # write prompt.md
//   node claude-muse-installer/build.cjs --check    # exit 1 if it is stale
//
// sources/ mirrors the installed tree minus the leading dots, so a file that
// needs fixing on a running machine can be copied straight over its twin.

const fs = require('node:fs');
const path = require('node:path');

const MARKER = /^<!--\s*muse:file\s+(\S+)\s+lang=(\S*)\s*-->$/;

// A fence closes at the first line whose run of backticks is at least as long
// as the one that opened it, so the opening run has to beat every run that
// starts a line inside the file. Only line-leading runs can close a block;
// backticks inside a sentence never do.
function fenceFor(body) {
  let longest = 0;
  for (const line of body) {
    const run = line.match(/^(`+)/);
    if (run && run[1].length > longest) longest = run[1].length;
  }
  return '`'.repeat(Math.max(3, longest + 1));
}

// The paragraph above a marker names the file the block writes. Checking that
// it agrees with the source the marker points at turns a mis-aimed marker into
// a build failure rather than a prompt that installs the wrong file under the
// right name.
function targetAbove(lines, index) {
  let i = index - 1;
  while (i >= 0 && !lines[i].trim()) i--;
  const collected = [];
  for (; i >= 0 && lines[i].trim(); i--) collected.unshift(lines[i]);
  const intro = collected.join(' ').replace(/\s+/g, ' ');
  const match = intro.match(/`(~\/[^`]+)`/);
  return match ? match[1] : null;
}

function render(dir = __dirname) {
  const templatePath = path.join(dir, 'prompt.template.md');
  const lines = fs.readFileSync(templatePath, 'utf8').split('\n');
  const out = [];
  let rendered = 0;

  lines.forEach((line, index) => {
    const marker = line.match(MARKER);
    if (!marker) {
      out.push(line);
      return;
    }
    const [, source, lang] = marker;
    const file = path.join(dir, source);
    if (!fs.existsSync(file)) {
      throw new Error(`${templatePath}:${index + 1} points at ${source}, which does not exist`);
    }
    const target = targetAbove(lines, index);
    if (!target) {
      throw new Error(`${templatePath}:${index + 1} has no paragraph above it naming a ~/ path`);
    }
    if (path.basename(target) !== path.basename(source)) {
      throw new Error(
        `${templatePath}:${index + 1} writes ${target} from ${source}; the file names differ`
      );
    }
    // One trailing newline is the file ending, not a blank last line of the
    // block. Anything beyond it is content and survives.
    const text = fs.readFileSync(file, 'utf8').replace(/\n$/, '');
    const body = text.split('\n');
    const fence = fenceFor(body);
    out.push(fence + lang, ...body, fence);
    rendered += 1;
  });

  return { text: out.join('\n'), rendered };
}

if (require.main === module) {
  const promptPath = path.join(__dirname, 'prompt.md');
  let result;
  try {
    result = render();
  } catch (error) {
    console.error('Error: ' + error.message);
    process.exit(1);
  }
  const current = fs.existsSync(promptPath) ? fs.readFileSync(promptPath, 'utf8') : null;
  if (process.argv.includes('--check')) {
    if (current === result.text) {
      console.log(
        `prompt.md is up to date with prompt.template.md and sources/ (${result.rendered} files).`
      );
    } else {
      console.error('prompt.md is stale. Run: node claude-muse-installer/build.cjs');
      process.exit(1);
    }
  } else {
    fs.writeFileSync(promptPath, result.text);
    const verb = current === result.text ? 'unchanged' : 'written';
    console.log(`prompt.md ${verb} from ${result.rendered} sources.`);
  }
}

module.exports = { render, fenceFor };
