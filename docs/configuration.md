# Configuration Guide

Create `winterlint.config.json` in your project root.

`winterlint` discovers config in this order while traversing upward:

1. `winterlint.config.json`
2. `.winterlintrc`
3. `.winterlintrc.json`
4. `package.json#winterlint`

## Supported Fields

- `targets: string[]`
- `include: string[]`
- `exclude: string[]`
- `ignorePatterns: string[]`
- `enabledRules: string[]`
- `disabledRules: string[]`
- `severityOverrides: Record<ruleId, "error"|"warn"|"info">`
- `packageIgnoreList: string[]`
- `allowlist: { ruleId, path?, package? }[]`
- `defaultReportFormat: "pretty"|"json"|"compact"|"markdown"`
- `maxIssues: number`
- `failOnWarning: boolean`
- `runtimeAssumptions: Record<string, string | boolean>`

## Validation behavior

- Unknown config fields are rejected to prevent silent typos.
- Invalid severity values fail fast.
- `maxIssues` must be a non-negative number.

## Example

```json
{
  "targets": ["cloudflare-workers", "vercel-edge", "wintertc"],
  "ignorePatterns": ["**/*.test.ts"],
  "disabledRules": ["runtime-conditional-code/unsafe-runtime-branching"],
  "severityOverrides": {
    "dynamic-loading/no-dynamic-require": "error"
  },
  "allowlist": [
    {
      "ruleId": "process-env/no-process-global",
      "path": "src/legacy"
    }
  ],
  "failOnWarning": false,
  "maxIssues": 50
}
```

## Runtime assumptions

`runtimeAssumptions` can override target boolean capability flags for advanced setups.

Examples:

- Global override: `"supportsProcessGlobal": false`
- Target-specific override: `"deno.supportsProcessGlobal": true`
