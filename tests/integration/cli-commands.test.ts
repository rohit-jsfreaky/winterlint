import { beforeEach, describe, expect, it } from 'vitest';
import { runCli } from '../../src/cli.js';
import { captureIO, fixturePath } from '../helpers.js';
import { access, rm } from 'node:fs/promises';
import { constants } from 'node:fs';

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

describe('cli commands', () => {
  beforeEach(() => {
    process.exitCode = 0;
  });

  it('lists rules', async () => {
    const { stdout } = await captureIO(() => runCli(['list-rules']));
    expect(stdout).toContain('node-builtins/no-unsupported-import');
  });

  it('lists targets', async () => {
    const { stdout } = await captureIO(() => runCli(['list-targets']));
    expect(stdout).toContain('cloudflare-workers');
  });

  it('explains a rule', async () => {
    const { stdout } = await captureIO(() => runCli(['explain', 'filesystem/no-fs-usage']));
    expect(stdout).toContain('Filesystem API assumption');
  });

  it('analyzes fixture with json output', async () => {
    const { stdout, result } = await captureIO(() => runCli(['analyze', fixturePath('node-fs'), '--format', 'json', '--target', 'cloudflare-workers']));
    expect(result).toBe(1);
    const parsed = JSON.parse(stdout);
    expect(parsed.summary.totalIssues).toBeGreaterThan(0);
  });

  it('supports init command', async () => {
    const fixture = fixturePath('edge-safe');
    const generated = `${fixture}\\winterlint.config.json`;

    if (await fileExists(generated)) {
      await rm(generated, { force: true });
    }

    const { result } = await captureIO(() => runCli(['init', fixture]));
    expect(result).toBe(0);
    expect(await fileExists(generated)).toBe(true);

    await rm(generated, { force: true });
  });
});
