# Releasing and Publishing

## Pre-release checklist

1. Update `CHANGELOG.md`
2. Run `npm run check`
3. Run `npm run build`
4. Verify `dist` output and CLI entry

## Publish

```bash
npm publish --access public
```

Package includes files listed in `package.json#files`.
