# winterlint

Runtime portability analyzer for JavaScript and TypeScript projects.

`winterlint` helps you answer a hard, practical question before deployment:

> Why does this code work in one JavaScript runtime, but fail in another?

It analyzes both your source code and your dependency graph to detect portability risks across modern runtimes such as Node.js, Bun, Deno, Cloudflare Workers, Vercel Edge, WinterTC baseline, and WinterJS-style runtime profiles.

## Table of Contents

- [Why winterlint](#why-winterlint)
- [Who this is for](#who-this-is-for)
- [What it checks](#what-it-checks)
- [Supported runtimes](#supported-runtimes)
- [Install](#install)
- [Quick start](#quick-start)
- [CLI reference](#cli-reference)
- [Configuration](#configuration)
- [Rule catalog](#rule-catalog)
- [Output formats](#output-formats)
- [Dependency blame](#dependency-blame)
- [Programmatic API](#programmatic-api)
- [ESLint integration (optional)](#eslint-integration-optional)
- [CI usage](#ci-usage)
- [Architecture](#architecture)
- [Testing](#testing)
- [Performance notes](#performance-notes)
- [Limitations](#limitations)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [Release and publishing](#release-and-publishing)
- [License](#license)

## Why winterlint

The JavaScript ecosystem now spans multiple execution environments:

- classic server runtimes (`node`)
- Node-compatible alternatives (`bun`)
- web-first server runtimes (`deno`)
- edge/worker runtimes (`cloudflare-workers`, `vercel-edge`)
- WinterTC portability baseline (`wintertc`, `winterjs`)

Code that appears fine locally can fail at deploy time because of runtime assumptions:

- importing Node-only core modules (`fs`, `child_process`, `net`, `tls`)
- relying on CommonJS-only packages in edge/ESM pipelines
- dynamic `require` patterns that break static bundling
- unguarded `process` and `Buffer` assumptions
- dependency chains that pull in Node-specific behavior transitively
- package export conditions resolving to Node-only builds

`winterlint` is designed as an "ESLint-for-runtime-portability" workflow with dependency-level blame.

## Who this is for

- library/package authors publishing to npm
- app teams targeting edge runtimes
- framework/plugin maintainers
- platform teams enforcing runtime portability in CI

## What it checks

`winterlint` combines source-level and dependency-level analysis:

- AST scan of JS/TS/CJS/ESM files
- import/require pattern inspection
- runtime global/API assumption checks
- dependency graph traversal
- package metadata and exports inspection
- transitive compatibility blame chains

The analyzer emits structured issues with:

- rule ID and category
- severity and confidence
- affected targets
- source location and package metadata
- explanation and recommended next action

## Supported runtimes

| Target ID | Runtime | Family | Notes |
| --- | --- | --- | --- |
| `node` | Node.js | `node-like` | Full Node APIs assumed available |
| `bun` | Bun | `node-like` | Broad Node compatibility + web APIs |
| `deno` | Deno | `browser-like` | Web-first runtime, Node compatibility is partial/opt-in |
| `cloudflare-workers` | Cloudflare Workers | `edge` | Worker isolate model, no local fs/process sockets |
| `vercel-edge` | Vercel Edge Runtime | `edge` | Worker-like edge profile |
| `wintertc` | WinterTC Baseline | `baseline` | Common portability baseline APIs |
| `winterjs` | WinterJS-style Runtime | `baseline` | Baseline-oriented profile with selected conveniences |

You can inspect targets at runtime:

```bash
npx winterlint list-targets
npx winterlint list-targets --json
```

## Install

```bash
npm install -D winterlint
```

Requirements:

- Node.js 18+

## Quick start

Analyze the current project for all default targets:

```bash
npx winterlint analyze .
```

Analyze only Cloudflare Workers + Vercel Edge:

```bash
npx winterlint analyze . --target cloudflare-workers,vercel-edge
```

Analyze one file:

```bash
npx winterlint analyze src/index.ts --file --target wintertc
```

Machine-readable JSON output for CI:

```bash
npx winterlint analyze . --format json > winterlint-report.json
```

Generate starter config:

```bash
npx winterlint init
```

## CLI reference

### Commands

- `winterlint analyze [path]`
- `winterlint explain <ruleId>`
- `winterlint list-rules`
- `winterlint list-targets`
- `winterlint init [path]`
- `winterlint help-targets`

### `analyze` options

- `--file`: treat input path as a single file
- `-t, --target <target...>`: target(s), comma-separated or repeated
- `-f, --format <pretty|json|compact|markdown>`
- `--json`: shortcut for JSON output
- `--quiet`: suppress full human output
- `--verbose`: enable verbose mode
- `-c, --config <path>`: explicit config path
- `--ignore <pattern...>`: additional ignore globs
- `--rule <rule=off|error|warn|info...>`: per-run rule overrides
- `--fail-on-warning`: non-zero exit code when warnings exist
- `--max-issues <count>`: non-zero exit code when issue count exceeds threshold
- `--no-deps`: skip dependency graph analysis

### Exit code behavior

`winterlint analyze` exits non-zero when:

- there is at least one `error` severity issue
- `failOnWarning` is enabled and warnings exist
- `maxIssues` is set and exceeded

## Configuration

Create one of these in project root (auto-discovered):

- `winterlint.config.json`
- `.winterlintrc`
- `.winterlintrc.json`
- `package.json#winterlint`

### Config fields

```ts
interface WinterlintConfig {
  targets?: RuntimeTargetId[];
  include?: string[];
  exclude?: string[];
  ignorePatterns?: string[];
  enabledRules?: string[];
  disabledRules?: string[];
  severityOverrides?: Record<string, 'error' | 'warn' | 'info'>;
  packageIgnoreList?: string[];
  allowlist?: Array<{ ruleId: string; path?: string; package?: string }>;
  defaultReportFormat?: 'pretty' | 'json' | 'compact' | 'markdown';
  maxIssues?: number;
  failOnWarning?: boolean;
  runtimeAssumptions?: Record<string, string | boolean>;
}
```

`runtimeAssumptions` is currently accepted for future compatibility profiles, but has limited behavioral effect in v1.

### Example config

```json
{
  "targets": ["cloudflare-workers", "vercel-edge", "wintertc"],
  "include": ["**/*.{js,mjs,cjs,ts,tsx,jsx}"],
  "exclude": ["**/node_modules/**", "**/dist/**"],
  "ignorePatterns": ["**/*.test.ts"],
  "disabledRules": ["runtime-conditional-code/unsafe-runtime-branching"],
  "severityOverrides": {
    "dynamic-loading/no-dynamic-require": "error",
    "process-env/no-process-global": "warn"
  },
  "packageIgnoreList": ["some-known-node-only-package"],
  "allowlist": [
    {
      "ruleId": "process-env/no-process-global",
      "path": "src/legacy"
    }
  ],
  "defaultReportFormat": "pretty",
  "failOnWarning": false,
  "maxIssues": 100
}
```

### Rule overrides from CLI

One-off overrides without changing config:

```bash
npx winterlint analyze . --rule dynamic-loading/no-dynamic-require=error
npx winterlint analyze . --rule runtime-conditional-code/unsafe-runtime-branching=off
```

## Rule catalog

Current v1 rules:

| Rule ID | Category | Default severity | Purpose |
| --- | --- | --- | --- |
| `node-builtins/no-unsupported-import` | `node-builtins` | `error` | Flags Node core imports unsupported by selected targets |
| `filesystem/no-fs-usage` | `filesystem` | `error` | Detects fs assumptions in no-filesystem runtimes |
| `networking/no-child-process` | `networking` | `error` | Detects `child_process` usage |
| `networking/no-raw-sockets` | `networking` | `error` | Detects `net`/`tls`/`dgram` assumptions |
| `node-builtins/no-cluster` | `node-builtins` | `error` | Detects `cluster` usage |
| `node-builtins/no-worker-threads` | `node-builtins` | `warn` | Detects Node worker_threads assumptions |
| `dynamic-loading/no-dynamic-require` | `dynamic-loading` | `warn` | Detects dynamic module loading patterns |
| `commonjs/cjs-only-package` | `commonjs` | `warn` | Detects CJS-only dependency entrypoints |
| `native-module/no-native-addon` | `native-module` | `error` | Detects native addon indicators |
| `process-env/no-process-global` | `process-env` | `warn` | Detects unguarded `process` assumptions |
| `streams-and-buffer-assumptions/no-buffer-global` | `streams-and-buffer-assumptions` | `warn` | Detects `Buffer` global assumptions |
| `web-crypto-vs-node-crypto/prefer-web-crypto` | `web-crypto-vs-node-crypto` | `warn` | Flags Node crypto when web crypto is preferable |
| `eval-security/no-eval-like` | `eval-security` | `warn` | Detects `eval` and `new Function` usage |
| `globals/no-dirname-filename` | `globals` | `warn` | Detects `__dirname`/`__filename` assumptions |
| `resolution/unresolved-import` | `resolution` | `warn` | Detects unresolved import paths likely to fail in stricter resolvers |
| `package-exports/node-only-condition` | `package-exports` | `error` | Detects node-only exports condition risk |
| `dependency-portability/transitive-node-runtime` | `dependency-portability` | `error` | Flags transitive Node-only dependency imports |
| `runtime-conditional-code/unsafe-runtime-branching` | `runtime-conditional-code` | `info` | Heuristic warning for runtime-branching risk |

Inspect rules:

```bash
npx winterlint list-rules
npx winterlint list-rules --json
npx winterlint explain filesystem/no-fs-usage
```

## Output formats

### 1) Pretty (`--format pretty`)

Human-readable report with:

- analysis metadata
- runtime matrix (PASS/FAIL by target)
- issue list with severity, category, location, affected targets
- blame chain and recommendation when available

### 2) JSON (`--format json`)

Machine-readable result for CI pipelines, dashboards, and custom tooling.

High-level shape:

```json
{
  "metadata": {
    "analyzedPath": "...",
    "generatedAt": "...",
    "version": "1.0.0",
    "targets": ["node", "cloudflare-workers"],
    "configUsed": {}
  },
  "issues": [],
  "summary": {
    "totalIssues": 0,
    "bySeverity": { "error": 0, "warn": 0, "info": 0 },
    "byTarget": {},
    "byCategory": {}
  },
  "runtimeMatrix": [],
  "dependencyChains": [],
  "packageSignals": []
}
```

### 3) Compact (`--format compact`)

Single-line issue format for log pipelines and minimal CLI output.

### 4) Markdown (`--format markdown`)

Markdown summary suitable for PR comments and artifact publishing.

## Dependency blame

Dependency blame is a first-class output in `winterlint`.

When a dependency causes a portability failure, issues can include:

- `rootProject`
- `chain` (for example `my-app -> dep-a -> dep-b`)
- `offendingPackage`
- `offendingFile` (if known)
- `exportPath` (if known)

This helps answer:

- Which package is actually blocking edge compatibility?
- Is the breakage direct or transitive?
- Which path in resolution selected the non-portable code?

## Programmatic API

Use `winterlint` as a library:

```ts
import {
  analyzeProject,
  analyzeFileContent,
  listRules,
  listTargets,
  resolveTarget,
  resolveTargets,
  formatReport
} from 'winterlint';

const result = await analyzeProject({
  path: process.cwd(),
  targets: ['cloudflare-workers', 'vercel-edge'],
  includeDependencies: true
});

const markdown = formatReport({ result, rules: listRules() }, 'markdown');
console.log(markdown);
```

Analyze an in-memory source string:

```ts
import { analyzeFileContent } from 'winterlint';

const result = await analyzeFileContent(
  'virtual.ts',
  "import fs from 'node:fs';\nexport const x = 1;",
  { targets: ['wintertc'] }
);
```

## ESLint integration (optional)

`winterlint` ships a lightweight ESLint plugin scaffold at `winterlint/eslint`.

Current starter rules:

- `winterlint/no-node-builtin-imports`
- `winterlint/no-process-global`

Example (flat config):

```js
import winterlint from 'winterlint/eslint';

export default [
  winterlint.configs.recommended
];
```

## CI usage

### Basic CI gate

```bash
npx winterlint analyze . --format json --target cloudflare-workers,vercel-edge > winterlint-report.json
```

`winterlint` already exits non-zero when errors exist.

### Strict CI mode

```bash
npx winterlint analyze . \
  --target cloudflare-workers,vercel-edge,wintertc \
  --fail-on-warning \
  --max-issues 0
```

### GitHub Actions sketch

```yaml
name: portability
on: [pull_request]

jobs:
  winterlint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npx winterlint analyze . --format json > winterlint-report.json
      - uses: actions/upload-artifact@v4
        with:
          name: winterlint-report
          path: winterlint-report.json
```

## Architecture

Top-level modules:

- `src/cli.ts`: command-line interface
- `src/config/*`: config discovery and validation
- `src/targets/*`: runtime target capability registry
- `src/core/fileScanner.ts`: AST extraction of source signals
- `src/core/dependencyGraph.ts`: dependency traversal and blame generation
- `src/core/rules/*`: rule metadata + detection engine
- `src/core/analyzer.ts`: orchestration and result modeling
- `src/reporters/*`: output formatters
- `src/eslint/index.ts`: ESLint plugin scaffold
- `src/index.ts`: public API exports

Design principles:

- target-aware diagnostics, not generic linting
- source + dependency analysis together
- typed and machine-readable output model
- modular rule system for expansion

## Testing

Test suites include:

- unit tests for targets/config/rules/reporting/dependency blame
- integration tests for CLI behavior and output
- fixture-driven matrix tests across runtime targets

Run checks locally:

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run check
```

## Performance notes

- Uses glob-based file collection and single-pass AST extraction per file
- Reuses structured signals across rule execution
- Traverses dependency tree from local `node_modules`
- Suitable for medium-size projects in CI workflows

## Limitations

- Static analysis cannot perfectly model every runtime execution path
- Dynamic code loading remains partially heuristic by design
- Dependency analysis is local; remote package scanning is not included
- Target profiles are not version-pinned per runtime release in v1
- ESLint integration is intentionally lightweight in v1

## Roadmap

Potential next improvements:

- deeper control-flow and guard-awareness to reduce false positives
- SARIF and richer CI annotation exporters
- expanded conditional export resolution strategies
- more exhaustive runtime-API compatibility profiles
- richer ESLint integration parity with core rules

## Contributing

Please read [CONTRIBUTING.md](./CONTRIBUTING.md).

Before opening a PR:

1. Add or update tests.
2. Keep rule IDs stable.
3. Update docs when behavior changes.
4. Run `npm run check`.

## Release and publishing

See [docs/releasing.md](./docs/releasing.md) for release workflow.

## Additional docs

- [Configuration guide](./docs/configuration.md)
- [Target profiles](./docs/targets.md)
- [Rules](./docs/rules.md)
- [Architecture overview](./docs/architecture.md)
- [Dependency blame](./docs/dependency-blame.md)
- [Testing guide](./docs/testing.md)

## License

MIT

