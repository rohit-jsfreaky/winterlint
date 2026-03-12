# Architecture Overview

`winterlint` v1 modules:

- `src/cli.ts`: command-line interface
- `src/config/*`: config discovery + validation
- `src/targets/*`: runtime capability registry
- `src/core/fileScanner.ts`: AST scan and source signal extraction
- `src/core/dependencyGraph.ts`: dependency traversal + chain attribution
- `src/core/rules/*`: modular rule engine and rule registry
- `src/core/analyzer.ts`: orchestration and result model
- `src/reporters/*`: pretty/json/compact/markdown output
- `src/eslint/index.ts`: optional ESLint plugin scaffold
- `src/index.ts`: programmatic API exports

Design goals:

- target-aware issues (not generic warnings)
- source + dependency analysis
- structured output for CI/automation
- clear extension points for new rules and targets
