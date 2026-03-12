import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../../src/core/analyzer.js';
import { fixturePath } from '../helpers.js';

describe('analyzer rules', () => {
  it('flags fs usage for edge targets', async () => {
    const result = await analyzeProject({
      path: fixturePath('node-fs'),
      targets: ['cloudflare-workers', 'node']
    });

    const fsIssue = result.issues.find((issue) => issue.ruleId === 'filesystem/no-fs-usage');
    expect(fsIssue).toBeTruthy();
    expect(fsIssue?.affectedTargets).toContain('cloudflare-workers');
    expect(fsIssue?.affectedTargets).not.toContain('node');
  });

  it('keeps edge-safe fixture mostly clean', async () => {
    const result = await analyzeProject({
      path: fixturePath('edge-safe'),
      targets: ['cloudflare-workers', 'vercel-edge', 'wintertc']
    });

    expect(result.summary.bySeverity.error).toBe(0);
  });
});
