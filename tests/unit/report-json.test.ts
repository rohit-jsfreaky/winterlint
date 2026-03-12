import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../../src/core/analyzer.js';
import { formatReport } from '../../src/reporters/index.js';
import { listRules } from '../../src/core/analyzer.js';
import { fixturePath } from '../helpers.js';

describe('json report', () => {
  it('returns machine-readable shape', async () => {
    const result = await analyzeProject({
      path: fixturePath('node-fs'),
      targets: ['cloudflare-workers', 'node']
    });

    const json = formatReport({ result, rules: listRules() }, 'json');
    const parsed = JSON.parse(json);
    expect(parsed.metadata).toBeTruthy();
    expect(Array.isArray(parsed.issues)).toBe(true);
    expect(parsed.summary).toBeTruthy();
    expect(Array.isArray(parsed.runtimeMatrix)).toBe(true);
  });
});
