import { readFileSync } from 'node:fs';

export function readConfig(file: string): string {
  return readFileSync(file, 'utf8');
}
