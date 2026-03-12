# Rules

## Core Rule List

- `node-builtins/no-unsupported-import`
- `filesystem/no-fs-usage`
- `networking/no-child-process`
- `networking/no-raw-sockets`
- `node-builtins/no-cluster`
- `node-builtins/no-worker-threads`
- `dynamic-loading/no-dynamic-require`
- `commonjs/cjs-only-package`
- `native-module/no-native-addon`
- `process-env/no-process-global`
- `streams-and-buffer-assumptions/no-buffer-global`
- `web-crypto-vs-node-crypto/prefer-web-crypto`
- `eval-security/no-eval-like`
- `globals/no-dirname-filename`
- `resolution/unresolved-import`
- `package-exports/node-only-condition`
- `dependency-portability/transitive-node-runtime`
- `runtime-conditional-code/unsafe-runtime-branching`

Each rule emits:

- what was found
- file/package location
- why portability is impacted
- affected runtime targets
- recommended next action
- confidence level

Use `winterlint explain <ruleId>` for details.
