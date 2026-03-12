import path from 'node:path';
import { access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { WinterlintConfig, Severity } from '../types.js';
import { readJsonFile } from '../utils/fs.js';

const CONFIG_CANDIDATES = ['winterlint.config.json', '.winterlintrc', '.winterlintrc.json'] as const;

const KNOWN_CONFIG_KEYS = new Set([
  'targets',
  'include',
  'exclude',
  'ignorePatterns',
  'disabledRules',
  'enabledRules',
  'severityOverrides',
  'packageIgnoreList',
  'allowlist',
  'defaultReportFormat',
  'maxIssues',
  'failOnWarning',
  'runtimeAssumptions'
]);

export const DEFAULT_CONFIG: WinterlintConfig = {
  targets: ['node', 'bun', 'deno', 'cloudflare-workers', 'vercel-edge', 'wintertc', 'winterjs'],
  include: ['**/*.{js,cjs,mjs,ts,tsx,jsx}'],
  exclude: ['**/node_modules/**', '**/dist/**', '**/coverage/**'],
  ignorePatterns: [],
  disabledRules: [],
  enabledRules: [],
  severityOverrides: {},
  packageIgnoreList: [],
  allowlist: [],
  defaultReportFormat: 'pretty',
  failOnWarning: false
};

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export async function discoverConfig(startDir: string): Promise<string | undefined> {
  let current = path.resolve(startDir);
  while (true) {
    for (const name of CONFIG_CANDIDATES) {
      const candidate = path.join(current, name);
      if (await fileExists(candidate)) {
        return candidate;
      }
    }

    const packageJson = path.join(current, 'package.json');
    if (await fileExists(packageJson)) {
      const packageData = await readJsonFile<{ winterlint?: WinterlintConfig }>(packageJson);
      if (packageData.winterlint) {
        return `${packageJson}#winterlint`;
      }
    }

    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }

  return undefined;
}

function isSeverity(value: unknown): value is Severity {
  return value === 'error' || value === 'warn' || value === 'info';
}

function validateKnownKeys(cfg: Record<string, unknown>): void {
  const unknown = Object.keys(cfg).filter((key) => !KNOWN_CONFIG_KEYS.has(key));
  if (unknown.length > 0) {
    throw new Error(`Unknown winterlint config field(s): ${unknown.join(', ')}`);
  }
}

export function validateConfig(input: unknown): WinterlintConfig {
  if (!input || typeof input !== 'object') {
    throw new Error('winterlint config must be an object');
  }

  const cfg = input as Record<string, unknown>;
  validateKnownKeys(cfg);

  const normalized: WinterlintConfig = {
    ...DEFAULT_CONFIG
  };

  const assignStringArray = (key: keyof WinterlintConfig): void => {
    const value = cfg[key as string];
    if (value === undefined) {
      return;
    }
    if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
      throw new Error(`winterlint config field "${String(key)}" must be a string array`);
    }
    (normalized as Record<string, unknown>)[key as string] = value;
  };

  assignStringArray('targets');
  assignStringArray('include');
  assignStringArray('exclude');
  assignStringArray('ignorePatterns');
  assignStringArray('disabledRules');
  assignStringArray('enabledRules');
  assignStringArray('packageIgnoreList');

  if (cfg.defaultReportFormat !== undefined) {
    if (!['pretty', 'json', 'compact', 'markdown'].includes(String(cfg.defaultReportFormat))) {
      throw new Error('winterlint config field "defaultReportFormat" must be one of pretty|json|compact|markdown');
    }
    normalized.defaultReportFormat = cfg.defaultReportFormat as WinterlintConfig['defaultReportFormat'];
  }

  if (cfg.maxIssues !== undefined) {
    if (typeof cfg.maxIssues !== 'number' || Number.isNaN(cfg.maxIssues) || cfg.maxIssues < 0) {
      throw new Error('winterlint config field "maxIssues" must be a non-negative number');
    }
    normalized.maxIssues = Math.floor(cfg.maxIssues);
  }

  if (cfg.failOnWarning !== undefined) {
    if (typeof cfg.failOnWarning !== 'boolean') {
      throw new Error('winterlint config field "failOnWarning" must be boolean');
    }
    normalized.failOnWarning = cfg.failOnWarning;
  }

  if (cfg.runtimeAssumptions !== undefined) {
    if (!cfg.runtimeAssumptions || typeof cfg.runtimeAssumptions !== 'object' || Array.isArray(cfg.runtimeAssumptions)) {
      throw new Error('winterlint config field "runtimeAssumptions" must be an object');
    }
    normalized.runtimeAssumptions = cfg.runtimeAssumptions as WinterlintConfig['runtimeAssumptions'];
  }

  if (cfg.severityOverrides !== undefined) {
    if (!cfg.severityOverrides || typeof cfg.severityOverrides !== 'object' || Array.isArray(cfg.severityOverrides)) {
      throw new Error('winterlint config field "severityOverrides" must be an object');
    }

    const severityMap: Record<string, Severity> = {};
    for (const [ruleId, severity] of Object.entries(cfg.severityOverrides)) {
      if (!isSeverity(severity)) {
        throw new Error(`severityOverrides.${ruleId} must be error|warn|info`);
      }
      severityMap[ruleId] = severity;
    }
    normalized.severityOverrides = severityMap;
  }

  if (cfg.allowlist !== undefined) {
    if (!Array.isArray(cfg.allowlist)) {
      throw new Error('winterlint config field "allowlist" must be an array');
    }

    const entries = cfg.allowlist.map((entry, index) => {
      if (!entry || typeof entry !== 'object') {
        throw new Error(`allowlist[${index}] must be an object`);
      }
      const value = entry as Record<string, unknown>;
      if (typeof value.ruleId !== 'string') {
        throw new Error(`allowlist[${index}].ruleId must be a string`);
      }

      return {
        ruleId: value.ruleId,
        path: typeof value.path === 'string' ? value.path : undefined,
        package: typeof value.package === 'string' ? value.package : undefined
      };
    });

    normalized.allowlist = entries;
  }

  return normalized;
}

async function loadPackageJsonEmbeddedConfig(virtualPath: string): Promise<WinterlintConfig> {
  const [packageJsonPath] = virtualPath.split('#');
  if (!packageJsonPath) {
    throw new Error('Invalid embedded config path');
  }
  const packageData = await readJsonFile<{ winterlint?: unknown }>(packageJsonPath);
  return validateConfig(packageData.winterlint ?? {});
}

export async function loadConfig(startDir: string, explicitPath?: string): Promise<{ config: WinterlintConfig; path?: string }> {
  const resolvedPath = explicitPath ? path.resolve(startDir, explicitPath) : await discoverConfig(startDir);

  if (!resolvedPath) {
    return { config: { ...DEFAULT_CONFIG } };
  }

  const config = resolvedPath.includes('#winterlint')
    ? await loadPackageJsonEmbeddedConfig(resolvedPath)
    : validateConfig(await readJsonFile(resolvedPath));

  return {
    config: {
      ...DEFAULT_CONFIG,
      ...config,
      severityOverrides: {
        ...DEFAULT_CONFIG.severityOverrides,
        ...config.severityOverrides
      }
    },
    path: resolvedPath
  };
}
