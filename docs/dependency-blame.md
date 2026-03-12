# Dependency Blame

Dependency blame links an issue to a dependency chain.

Example chain:

`my-app -> dep-a -> dep-b`

Blame data includes:

- root project
- full chain
- offending package
- offending file (when known)
- resolved export path (when known)

This allows users to answer:

- which package blocks edge compatibility?
- is the issue direct or transitive?
- where in dependency resolution did portability break?
