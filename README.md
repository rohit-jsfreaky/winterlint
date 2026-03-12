# winterlint

`winterlint` is a runtime portability analyzer for JavaScript/TypeScript projects.

It helps answer:

- Why does this package work in Node.js but fail on Edge?
- Which dependency is blocking Cloudflare Workers or Vercel Edge compatibility?
- Which exact rule and file should I fix first?

## Runtime Targets

Built-in targets:

- Node.js (`node`)
- Bun (`bun`)
- Deno (`deno`)
- Cloudflare Workers (`cloudflare-workers`)
- Vercel Edge (`vercel-edge`)
- WinterTC baseline (`wintertc`)
- WinterJS-style profile (`winterjs`)

## Install

```bash
npm install -D winterlint
```

## Quick Start

```bash
npx winterlint analyze .
npx winterlint analyze . --target cloudflare-workers --format pretty
npx winterlint analyze . --target cloudflare-workers,vercel-edge --format json
```

Generate config:

```bash
npx winterlint init
```

## CLI

### Commands

- `winterlint analyze [path]`
- `winterlint explain <ruleId>`
- `winterlint list-rules`
- `winterlint list-targets`
- `winterlint init [path]`

### Analyze Options

- `--file`: analyze one file
- `--target <id...>`: select one or more targets
- `--format <pretty|json|compact|markdown>`
- `--json`: shortcut for JSON output
- `--quiet`
- `--verbose`
- `--config <path>`
- `--ignore <glob...>`
- `--rule <rule=off|error|warn|info...>`
- `--fail-on-warning`
- `--max-issues <n>`
- `--no-deps`: skip dependency traversal

Exit code is non-zero when errors exist (or warning/threshold options are triggered).

## Programmatic API

```ts
import { analyzeProject, analyzeFileContent, listRules, listTargets } from 'winterlint';

const result = await analyzeProject({
  path: process.cwd(),
  targets: ['cloudflare-workers', 'vercel-edge']
});

console.log(result.runtimeMatrix);
```

## ESLint Integration (Optional)

`winterlint` ships a lightweight ESLint plugin export at `winterlint/eslint` with starter rules:

- `winterlint/no-node-builtin-imports`
- `winterlint/no-process-global`

## Output Model

JSON output includes:

- metadata
- analyzed path
- selected targets
- issues
- summary counts
- dependency chains
- package signals
- runtime matrix
- config used

## Rule Coverage (v1)

- Node builtins (`fs`, `child_process`, `net`, `tls`, `dgram`, `cluster`, `worker_threads`, etc.)
- dynamic loading (`require(expr)`, dynamic import)
- CommonJS-only dependency entrypoints
- native addon signals
- `process` and `Buffer` global assumptions
- Node crypto usage for web-first targets
- `eval` / `new Function`
- `__dirname` / `__filename`
- unresolved imports and resolver assumptions
- conditional exports portability
- transitive dependency portability blame
- runtime branching heuristics

## Why winterlint exists

Modern packages increasingly need to run in multiple JS runtimes. Static type/lint checks do not normally explain runtime portability failures or transitive dependency blockers. `winterlint` provides a target-aware and dependency-aware portability analysis workflow.

## Limitations

- static analysis is heuristic for dynamic runtime behavior
- dependency inspection follows local `node_modules`; it does not fetch remote packages
- runtime API support differences can change over time; target profiles are versionless in v1

## Docs

- [Configuration](./docs/configuration.md)
- [Targets](./docs/targets.md)
- [Rules](./docs/rules.md)
- [Architecture](./docs/architecture.md)
- [Dependency Blame](./docs/dependency-blame.md)
- [Testing](./docs/testing.md)
- [Releasing](./docs/releasing.md)
- [Contributing](./CONTRIBUTING.md)

## License

MIT
