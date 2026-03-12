import os from 'node:os';
import path from 'node:path';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../../src/core/analyzer.js';
import { validateConfig } from '../../src/config/index.js';
import { fixturePath } from '../helpers.js';

describe('production hardening', () => {
  it('analyzes source projects without package.json', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'winterlint-no-pkg-'));
    try {
      const srcDir = path.join(tempRoot, 'src');
      await mkdir(srcDir, { recursive: true });
      await writeFile(path.join(srcDir, 'index.ts'), "import fs from 'node:fs';\nexport const x = fs.readFileSync;\n", 'utf8');

      const result = await analyzeProject({
        path: tempRoot,
        targets: ['cloudflare-workers']
      });

      expect(result.summary.totalIssues).toBeGreaterThan(0);
      expect(result.dependencyChains.length).toBe(0);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('fails clearly on unknown target names', async () => {
    await expect(
      analyzeProject({
        path: fixturePath('edge-safe'),
        targets: ['cloudflare-workers', 'not-a-real-runtime' as any]
      })
    ).rejects.toThrowError(/Unknown target/);
  });

  it('rejects unknown config fields to prevent silent typos', () => {
    expect(() =>
      validateConfig({
        targets: ['node'],
        typoField: true
      })
    ).toThrowError(/Unknown winterlint config field/);
  });

  it('computes top offenders in summary', async () => {
    const result = await analyzeProject({
      path: fixturePath('transitive-node-only'),
      targets: ['cloudflare-workers', 'wintertc']
    });

    expect(result.summary.topOffendingPackages.length).toBeGreaterThan(0);
    expect(result.summary.topOffendingFiles.length).toBeGreaterThan(0);
    expect(result.summary.topOffendingPackages.some((entry) => entry.name === 'dep-b')).toBe(true);
  });
});
