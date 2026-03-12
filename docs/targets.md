# Supported Targets

## `node`
Node.js server runtime; full Node core API assumptions are valid.

## `bun`
Node-compatible runtime with broad API support and web APIs.

## `deno`
Web-first runtime; Node compatibility is partial and often opt-in.

## `cloudflare-workers`
Edge isolate runtime. No local filesystem, child process, or raw sockets.

## `vercel-edge`
Edge runtime profile similar to worker model.

## `wintertc`
Minimal common API baseline across WinterTC-compatible runtimes.

## `winterjs`
WinterJS-style profile: baseline-focused with selected conveniences.

## Notes

Targets are intentionally distinct. `winterlint` does not treat all non-Node runtimes as equivalent.
