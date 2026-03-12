import fg from 'fast-glob';
import path from 'node:path';
import picomatch from 'picomatch';

export interface FileCollectionOptions {
  cwd: string;
  include: string[];
  exclude: string[];
  ignorePatterns: string[];
}

export async function collectSourceFiles(options: FileCollectionOptions): Promise<string[]> {
  const { cwd, include, exclude, ignorePatterns } = options;
  const matches = await fg(include, {
    cwd,
    ignore: exclude,
    onlyFiles: true,
    absolute: true,
    dot: false
  });

  if (ignorePatterns.length === 0) {
    return matches.map((value) => path.resolve(value));
  }

  const isIgnored = ignorePatterns.map((pattern) => picomatch(pattern, { dot: true }));
  return matches
    .map((value) => path.resolve(value))
    .filter((filePath) => {
      const relative = path.relative(cwd, filePath).replace(/\\/g, '/');
      return !isIgnored.some((matcher) => matcher(relative));
    });
}
