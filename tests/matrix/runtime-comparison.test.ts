import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../../src/core/analyzer.js';
import { fixturePath } from '../helpers.js';

describe('runtime comparisons', () => {
  it('net/tls usage is not portable to edge', async () => {
    const result = await analyzeProject({
      path: fixturePath('net-tls'),
      targets: ['node', 'bun', 'cloudflare-workers', 'vercel-edge', 'wintertc']
    });

    const matrix = Object.fromEntries(result.runtimeMatrix.map((row) => [row.target, row]));
    expect(matrix.node!.pass).toBe(true);
    expect(matrix.bun!.pass).toBe(true);
    expect(matrix['cloudflare-workers']!.pass).toBe(false);
    expect(matrix['vercel-edge']!.pass).toBe(false);
    expect(matrix.wintertc!.pass).toBe(false);
  });

  it('process/buffer assumptions affect baseline runtimes', async () => {
    const result = await analyzeProject({
      path: fixturePath('process-buffer'),
      targets: ['node', 'wintertc', 'cloudflare-workers']
    });

    const processIssue = result.issues.find((issue) => issue.ruleId === 'process-env/no-process-global');
    const bufferIssue = result.issues.find((issue) => issue.ruleId === 'streams-and-buffer-assumptions/no-buffer-global');

    expect(processIssue?.affectedTargets).toContain('wintertc');
    expect(bufferIssue?.affectedTargets).toContain('cloudflare-workers');
  });
});
