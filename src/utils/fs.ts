import { readFile } from 'node:fs/promises';

export async function readJsonFile<T>(filePath: string): Promise<T> {
  const raw = await readFile(filePath, 'utf8');
  return JSON.parse(raw) as T;
}

export function toPosixPath(value: string): string {
  return value.replace(/\\/g, '/');
}
