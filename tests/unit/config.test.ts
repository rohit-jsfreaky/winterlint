import { describe, expect, it } from 'vitest';
import { validateConfig } from '../../src/config/index.js';

describe('config validation', () => {
  it('accepts minimal valid object', () => {
    const cfg = validateConfig({});
    expect(cfg.targets?.length).toBeGreaterThan(0);
  });

  it('throws on invalid severity override', () => {
    expect(() =>
      validateConfig({
        severityOverrides: {
          'x': 'fatal'
        }
      })
    ).toThrowError(/severityOverrides/);
  });

  it('throws on invalid ignorePatterns type', () => {
    expect(() => validateConfig({ ignorePatterns: 123 })).toThrowError(/ignorePatterns/);
  });
});
