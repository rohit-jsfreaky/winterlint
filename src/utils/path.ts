import path from 'node:path';

export function isInside(parent: string, child: string): boolean {
  const rel = path.relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

export function normalizeAbs(input: string, cwd: string): string {
  return path.resolve(cwd, input);
}
