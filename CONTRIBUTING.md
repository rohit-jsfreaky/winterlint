# Contributing

## Development

```bash
npm install
npm run test
npm run typecheck
npm run lint
npm run build
```

## Structure

- add new runtime profiles in `src/targets`
- add rules in `src/core/rules/builtinRules.ts`
- keep rule metadata + diagnostics high quality
- add regression tests for every bug/rule change

## Pull request expectations

- tests added/updated
- docs updated when behavior changes
- rule IDs remain stable once released
