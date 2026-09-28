# find-polluter

[![CI](https://github.com/joshuablac/find-polluter/actions/workflows/ci.yml/badge.svg)](https://github.com/joshuablac/find-polluter/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**"Passes alone, fails in the suite" → one command.**

When a Jest or Vitest test fails only because an *earlier test in the same file* leaked state
(a module cache, `process.env`, an un-restored spy, fake timers, a global), `find-polluter`
names that earlier test. No LLM, no guessing — it re-runs subsets of the file and applies
delta debugging (Zeller's ddmin) until one minimal culprit set remains.

pytest has `detect-test-pollution`, RSpec has `rspec --bisect`. JavaScript had nothing on npm.

## Usage

```bash
npx find-polluter <test-file> ["victim full name"] [--runner jest|vitest] [--repeat N]
```

- With no victim, every failing test in the file is investigated.
- The runner is auto-detected from `package.json` (override with `--runner`).
- `--repeat N` repeats each determinism check (default 2). Raise it for suspected flaky tests.

Exit codes: `1` polluter found · `0` none found · `2` error.

## Example

```
find-polluter: jest, __tests__/cache.test.js

✗ reads empty cache
  polluted by:
    → writer › seeds the cache
      (may be a beforeAll/afterAll hook in "writer")

12 runs.
```

## How it works

1. Runs the file once with a JSON reporter and collects failing tests.
2. For each victim, checks (repeated N times) that it **passes alone** and **fails after all
   earlier tests**. Otherwise it reports `fails-alone`, `nondeterministic`, or `no-polluter` —
   it never names a polluter it cannot reproduce.
3. Runs ddmin over the tests declared before the victim, then re-verifies the result.

Tests are selected with an anchored `-t` regex of exact full names. Every run is checked:
one file only, the selected count matches, and the victim actually ran.

## Scope (honest limits)

- **Same file, declaration order only.** Pollution from another file (shared workers,
  `--runInBand`) and polluters declared *after* the victim are out of scope.
- If the culprit is inside a `describe`, a `beforeAll`/`afterAll` hook in that block may be
  the real polluter; the output says so.
- Tests whose full names collide exactly cannot be isolated; the tool stops with an error instead of guessing.

## Requirements

Node ≥ 18, Jest or Vitest installed in the project. Zero dependencies.

## License

MIT
