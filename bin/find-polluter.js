#!/usr/bin/env node
// find-polluter: name the test that pollutes shared state and makes a later
// test in the same file fail. Deterministic delta debugging; Jest and Vitest.
'use strict';
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const USAGE = `Usage: find-polluter <test-file> ["victim full name"] [--runner jest|vitest] [--repeat N]

  Runs <test-file>, and for each failing test (or only the named victim)
  finds the earlier test in the same file whose side effects cause the failure.
  --repeat N   times each determinism check is repeated (default 2)`;

function parseArgs(argv) {
  const o = { repeat: 2, positional: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--runner') o.runner = argv[++i];
    else if (a === '--repeat') o.repeat = Math.max(1, parseInt(argv[++i], 10) || 2);
    else if (a === '-h' || a === '--help') { console.log(USAGE); process.exit(0); }
    else o.positional.push(a);
  }
  if (!o.positional.length) { console.error(USAGE); process.exit(2); }
  [o.file, o.victim] = o.positional;
  return o;
}

function detectRunner(cwd) {
  let pkg = {};
  try { pkg = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf8')); } catch {}
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  const hasV = 'vitest' in deps, hasJ = 'jest' in deps;
  if (hasV && !hasJ) return 'vitest';
  if (hasJ && !hasV) return 'jest';
  const script = (pkg.scripts && pkg.scripts.test) || '';
  if (/vitest/.test(script)) return 'vitest';
  if (/jest/.test(script)) return 'jest';
  throw new Error('Could not detect runner; pass --runner jest|vitest');
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\\/]/g, '\\$&');

function makeRunner(kind, file) {
  const sep = kind === 'vitest' ? ' > ' : ' ';
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'find-polluter-')), 'report.json');
  const key = (t) => [...t.ancestors, t.title].join(sep);
  let runs = 0;

  function run(tests) {
    runs++;
    const args = kind === 'vitest'
      ? ['vitest', 'run', file, '--reporter=json', `--outputFile=${out}`]
      : ['jest', '--runTestsByPath', file, '--json', `--outputFile=${out}`, '--ci'];
    if (tests) args.push('-t', '^(?:' + tests.map((t) => escapeRe(key(t))).join('|') + ')$');
    try { fs.unlinkSync(out); } catch {}
    const r = spawnSync('npx', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    if (!fs.existsSync(out)) {
      throw new Error(`${kind} wrote no JSON report. Output:\n${(r.stdout || '') + (r.stderr || '')}`.slice(0, 4000));
    }
    const rep = JSON.parse(fs.readFileSync(out, 'utf8'));
    if (rep.testResults.length !== 1) {
      throw new Error(`Expected exactly one test file in the report, got ${rep.testResults.length}. Pass a more specific path.`);
    }
    const fr = rep.testResults[0];
    const results = fr.assertionResults
      .filter((a) => a.status === 'passed' || a.status === 'failed')
      .map((a) => ({ ancestors: a.ancestorTitles, title: a.title, status: a.status }));
    if (!results.length && fr.status === 'failed' && fr.message) {
      throw new Error(`Test file failed to run:\n${fr.message}`.slice(0, 4000));
    }
    if (tests && results.length !== tests.length) {
      throw new Error(`Name filter selected ${results.length} tests, expected ${tests.length}. ` +
        'Test names may be duplicated or differ only by case.');
    }
    return results;
  }
  return { run, key, runs: () => runs };
}

// Does running `subset` (in declaration order) before the victim make it fail?
function makeFails(runner, victim) {
  const vk = runner.key(victim);
  return (subset) => {
    const res = runner.run([...subset, victim]);
    const v = res.find((r) => runner.key(r) === vk);
    if (!v) throw new Error(`Victim "${vk}" did not run (skipped?). Aborting.`);
    return v.status === 'failed';
  };
}

// Zeller's ddmin: a 1-minimal subset of `cs` that still makes the victim fail.
function ddmin(cs, fails) {
  let n = 2;
  while (cs.length >= 2) {
    const size = Math.ceil(cs.length / n);
    const chunks = [];
    for (let i = 0; i < cs.length; i += size) chunks.push(cs.slice(i, i + size));
    let reduced = false;
    for (const c of chunks) {
      if (fails(c)) { cs = c; n = 2; reduced = true; break; }
    }
    if (!reduced) {
      for (const c of chunks) {
        const comp = cs.filter((t) => !c.includes(t));
        if (comp.length && fails(comp)) { cs = comp; n = Math.max(n - 1, 2); reduced = true; break; }
      }
    }
    if (!reduced) {
      if (n >= cs.length) break;
      n = Math.min(cs.length, n * 2);
    }
  }
  return cs;
}

const allEqual = (k, f) => { const first = f(); for (let i = 1; i < k; i++) if (f() !== first) return null; return first; };

function investigate(runner, tests, victim, repeat) {
  const vk = runner.key(victim);
  const idx = tests.findIndex((t) => runner.key(t) === vk);
  const before = tests.slice(0, idx);
  const fails = makeFails(runner, victim);
  const dupes = tests.filter((t) => runner.key(t).toLowerCase() === vk.toLowerCase());
  if (dupes.length > 1) return { verdict: 'ambiguous', detail: `${dupes.length} tests share this name (case-insensitively).` };

  const alone = allEqual(repeat, () => fails([]));
  if (alone === null) return { verdict: 'nondeterministic', detail: 'Victim alone sometimes passes, sometimes fails.' };
  if (alone) return { verdict: 'fails-alone', detail: 'Victim fails when run by itself (or is flaky); not an ordering problem.' };
  if (!before.length) return { verdict: 'no-polluter', detail: 'Victim is the first test in the file.' };
  const withPrefix = allEqual(repeat, () => fails(before));
  if (withPrefix === null) return { verdict: 'nondeterministic', detail: 'Victim is flaky after the preceding tests.' };
  if (!withPrefix) return { verdict: 'no-polluter', detail: 'Victim passes after all preceding tests; failure did not reproduce (flaky, or polluted by a later/other file).' };

  const culprits = ddmin(before, fails);
  // Re-verify so a random flake never produces a fake culprit.
  const confirmed = allEqual(repeat, () => fails(culprits)) === true && allEqual(repeat, () => fails([])) === false;
  if (!confirmed) return { verdict: 'nondeterministic', detail: 'Candidate did not reproduce on re-verification.' };
  return { verdict: 'polluter', culprits };
}

function main() {
  const o = parseArgs(process.argv.slice(2));
  if (!fs.existsSync(o.file)) { console.error(`No such file: ${o.file}`); process.exit(2); }
  const kind = o.runner || detectRunner(process.cwd());
  const runner = makeRunner(kind, o.file);
  console.log(`find-polluter: ${kind}, ${o.file}`);

  const full = runner.run(null);
  const tests = full;
  let victims;
  if (o.victim) {
    victims = tests.filter((t) => runner.key(t) === o.victim || [...t.ancestors, t.title].join(' ') === o.victim);
    if (!victims.length) { console.error(`No test named "${o.victim}". Tests:\n  ` + tests.map(runner.key).join('\n  ')); process.exit(2); }
  } else {
    victims = tests.filter((t) => t.status === 'failed');
    if (!victims.length) { console.log('All tests passed in file order; nothing to investigate.'); return; }
  }

  let found = 0;
  for (const v of victims) {
    const name = [...v.ancestors, v.title].join(' › ');
    const r = investigate(runner, tests, v, o.repeat);
    if (r.verdict === 'polluter') {
      found++;
      console.log(`\n✗ ${name}`);
      console.log(`  polluted by${r.culprits.length > 1 ? ' (only in combination)' : ''}:`);
      for (const c of r.culprits) {
        console.log(`    → ${[...c.ancestors, c.title].join(' › ')}`);
        if (c.ancestors.length) console.log(`      (may be a beforeAll/afterAll hook in "${c.ancestors.join(' › ')}")`);
      }
    } else {
      console.log(`\n· ${name}\n  ${r.verdict}: ${r.detail}`);
    }
  }
  console.log(`\n${runner.runs()} runs.`);
  process.exitCode = found ? 1 : 0;
}

try { main(); } catch (e) { console.error(`find-polluter: ${e.message}`); process.exit(2); }
