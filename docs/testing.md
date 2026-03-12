# Testing Guide

## Test Layers

- Unit tests: targets, config validation, rule behavior, dependency blame, report shape
- Integration tests: CLI command behavior and outputs
- Target matrix tests: differences across Node/Bun/Deno/Edge/WinterTC profiles
- Fixture projects: realistic runtime portability scenarios

## Run

```bash
npm test
npm run typecheck
npm run lint
npm run build
```
