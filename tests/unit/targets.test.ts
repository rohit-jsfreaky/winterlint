import { describe, expect, it } from 'vitest';
import { listTargets, resolveTarget, resolveTargets } from '../../src/targets/index.js';

describe('targets registry', () => {
  it('resolves aliases', () => {
    const workers = resolveTarget('workers');
    expect(workers?.id).toBe('cloudflare-workers');
  });

  it('returns all targets by default', () => {
    expect(resolveTargets().length).toBeGreaterThanOrEqual(7);
  });

  it('lists target metadata', () => {
    const targets = listTargets();
    expect(targets.some((target) => target.id === 'wintertc')).toBe(true);
  });
});
