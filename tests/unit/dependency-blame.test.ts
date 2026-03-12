import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../../src/core/analyzer.js';
import { fixturePath } from '../helpers.js';

describe('dependency blame', () => {
  it('captures transitive dependency chain', async () => {
    const result = await analyzeProject({
      path: fixturePath('transitive-node-only'),
      targets: ['cloudflare-workers', 'wintertc']
    });

    const depIssue = result.issues.find((issue) => issue.ruleId === 'dependency-portability/transitive-node-runtime');
    expect(depIssue).toBeTruthy();
    expect(depIssue?.dependencyBlame?.offendingPackage).toBe('dep-b');
    expect(depIssue?.dependencyBlame?.chain.join('->')).toContain('dep-a');
    expect(depIssue?.dependencyBlame?.chain[0]).toBe('fixture-transitive-node-only');
  });
});

