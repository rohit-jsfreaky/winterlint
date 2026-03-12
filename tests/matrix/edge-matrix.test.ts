import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../../src/core/analyzer.js';
import { fixturePath } from '../helpers.js';

describe('edge target matrix', () => {
  it('node-fs fails edge but passes node', async () => {
    const result = await analyzeProject({
      path: fixturePath('node-fs'),
      targets: ['node', 'cloudflare-workers', 'vercel-edge', 'wintertc', 'bun', 'deno']
    });

    const matrix = Object.fromEntries(result.runtimeMatrix.map((row) => [row.target, row]));
    expect(matrix.node!.pass).toBe(true);
    expect(matrix['cloudflare-workers']!.pass).toBe(false);
    expect(matrix['vercel-edge']!.pass).toBe(false);
    expect(matrix.wintertc!.pass).toBe(false);
  });

  it('edge-safe remains pass on edge targets', async () => {
    const result = await analyzeProject({
      path: fixturePath('edge-safe'),
      targets: ['cloudflare-workers', 'vercel-edge', 'wintertc', 'winterjs']
    });

    for (const row of result.runtimeMatrix) {
      expect(row.errorCount).toBe(0);
    }
  });
});
