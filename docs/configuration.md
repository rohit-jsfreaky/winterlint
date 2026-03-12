# Configuration Guide

Create `winterlint.config.json` in your project root.

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
