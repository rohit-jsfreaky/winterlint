import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { AnalyzeOptions, AnalysisResult, AnalysisSummary, RuntimeMatrix, RuntimeTarget, RuntimeTargetId, WinterlintConfig } from '../types.js';
import { collectSourceFiles } from './collectFiles.js';
import { scanSourceFile } from './fileScanner.js';
import { analyzeDependencies } from './dependencyGraph.js';
import { runRules } from './rules/engine.js';
import { listRuleMeta } from './rules/builtinRules.js';
import { loadConfig } from '../config/index.js';
import { listTargets } from '../targets/index.js';
import { RuleContext } from './rules/ruleTypes.js';

const VERSION = '1.0.0';
const MAX_TOP_OFFENDERS = 5;

const BOOLEAN_RUNTIME_CAPABILITIES = new Set([
  'supportsNodeBuiltins',
  'supportsFileSystem',
  'supportsTcpSockets',
  'supportsChildProcess',
  'supportsWorkerThreads',
  'supportsProcessGlobal',
  'supportsBufferGlobal',
  'supportsEvalLike',
  'supportsNativeAddons',
  'prefersWebCrypto'
]);

function mergeConfig(base: WinterlintConfig, overrides?: WinterlintConfig): WinterlintConfig {
  if (!overrides) {
    return base;
  }

  return {
    ...base,
    ...overrides,
    severityOverrides: {
      ...(base.severityOverrides ?? {}),
      ...(overrides.severityOverrides ?? {})
    }
  };
}

function resolveTargetsStrict(targetNames: string[] | undefined): RuntimeTarget[] {
  const available = listTargets();
  if (!targetNames || targetNames.length === 0) {
    return available;
  }

  const byName = new Map<string, RuntimeTarget>();
  for (const target of available) {
    byName.set(target.id, target);
    for (const alias of target.aliases) {
      byName.set(alias, target);
    }
  }

  const unknown: string[] = [];
  const selected = new Map<RuntimeTargetId, RuntimeTarget>();

  for (const targetName of targetNames) {
    const found = byName.get(targetName);
    if (!found) {
      unknown.push(targetName);
      continue;
    }
    selected.set(found.id, found);
  }

  if (unknown.length > 0) {
    throw new Error(`Unknown target(s): ${unknown.join(', ')}`);
  }

  return [...selected.values()];
}

function applyRuntimeAssumptions(targets: RuntimeTarget[], assumptions?: Record<string, string | boolean>): RuntimeTarget[] {
  if (!assumptions || Object.keys(assumptions).length === 0) {
    return targets;
  }

  const mutable = targets.map((target) => ({ ...target }));
  const targetMap = new Map<string, RuntimeTarget>(mutable.map((target) => [target.id, target]));

  for (const [key, value] of Object.entries(assumptions)) {
    if (typeof value !== 'boolean') {
      continue;
    }

    const parts = key.split('.');
    const prefix = parts[0];
    if (!prefix) {
      continue;
    }
    const capability = parts.length > 1 ? parts.slice(1).join('.') : undefined;

    if (capability && targetMap.has(prefix) && BOOLEAN_RUNTIME_CAPABILITIES.has(capability)) {
      const target = targetMap.get(prefix);
      if (target) {
        (target as unknown as Record<string, unknown>)[capability] = value;
      }
      continue;
    }

    if (!capability && BOOLEAN_RUNTIME_CAPABILITIES.has(prefix)) {
      for (const target of mutable) {
        (target as unknown as Record<string, unknown>)[prefix] = value;
      }
    }
  }

  return mutable;
}

function toTopList(input: Map<string, number>, limit = MAX_TOP_OFFENDERS): Array<{ name: string; count: number }> {
  return [...input.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([name, count]) => ({ name, count }));
}

function toTopFileList(input: Map<string, number>, limit = MAX_TOP_OFFENDERS): Array<{ path: string; count: number }> {
  return [...input.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([filePath, count]) => ({ path: filePath, count }));
}

function summarize(resultIssues: AnalysisResult['issues'], targets: RuntimeTargetId[]): AnalysisSummary {
  const bySeverity: AnalysisSummary['bySeverity'] = {
    error: 0,
    warn: 0,
    info: 0
  };

  const byTarget = Object.fromEntries(targets.map((target) => [target, 0])) as AnalysisSummary['byTarget'];
  const byCategory: AnalysisSummary['byCategory'] = {};
  const packageCounts = new Map<string, number>();
  const fileCounts = new Map<string, number>();

  for (const issue of resultIssues) {
    bySeverity[issue.severity] += 1;

    for (const target of issue.affectedTargets) {
      byTarget[target] = (byTarget[target] ?? 0) + 1;
    }

    byCategory[issue.category] = (byCategory[issue.category] ?? 0) + 1;

    if (issue.packageName) {
      packageCounts.set(issue.packageName, (packageCounts.get(issue.packageName) ?? 0) + 1);
    }

    if (issue.location?.filePath) {
      fileCounts.set(issue.location.filePath, (fileCounts.get(issue.location.filePath) ?? 0) + 1);
    }
  }

  return {
    totalIssues: resultIssues.length,
    bySeverity,
    byTarget,
    byCategory,
    topOffendingPackages: toTopList(packageCounts),
    topOffendingFiles: toTopFileList(fileCounts)
  };
}

function buildRuntimeMatrix(issues: AnalysisResult['issues'], targets: RuntimeTargetId[]): RuntimeMatrix[] {
  return targets.map((target) => {
    const targetIssues = issues.filter((issue) => issue.affectedTargets.includes(target));
    const errorCount = targetIssues.filter((issue) => issue.severity === 'error').length;
    const warnCount = targetIssues.filter((issue) => issue.severity === 'warn').length;

    return {
      target,
      pass: errorCount === 0,
      issueCount: targetIssues.length,
      errorCount,
      warnCount
    };
  });
}

function applyRuleOverrides(config: WinterlintConfig, ruleOverrides?: Record<string, 'off' | 'error' | 'warn' | 'info'>): WinterlintConfig {
  if (!ruleOverrides) {
    return config;
  }

  const disabledRules = new Set(config.disabledRules ?? []);
  const severityOverrides = { ...(config.severityOverrides ?? {}) };

  for (const [ruleId, value] of Object.entries(ruleOverrides)) {
    if (value === 'off') {
      disabledRules.add(ruleId);
      continue;
    }
    severityOverrides[ruleId] = value;
  }

  return {
    ...config,
    disabledRules: [...disabledRules],
    severityOverrides
  };
}

function parseMaxIssues(value: number | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Number.isFinite(value) || value < 0) {
    throw new Error('maxIssues must be a non-negative number');
  }
  return Math.floor(value);
}

export async function analyzeProject(options: AnalyzeOptions): Promise<AnalysisResult> {
  const cwd = options.cwd ? path.resolve(options.cwd) : process.cwd();
  const targetPath = path.resolve(cwd, options.path);
  const configBasePath = options.fileMode ? path.dirname(targetPath) : targetPath;

  const { config: loadedConfig, path: loadedConfigPath } = await loadConfig(configBasePath, options.configPath);
  const merged = mergeConfig(loadedConfig, options.configOverrides);
  const config = applyRuleOverrides(merged, options.ruleOverrides);
  config.maxIssues = parseMaxIssues(config.maxIssues);

  const configuredTargets = options.targets ?? config.targets;
  const selectedTargets = applyRuntimeAssumptions(resolveTargetsStrict(configuredTargets), config.runtimeAssumptions);

  const filePaths = options.fileMode
    ? [targetPath]
    : await collectSourceFiles({
        cwd: targetPath,
        include: options.include ?? config.include ?? ['**/*.{js,cjs,mjs,ts,tsx,jsx}'],
        exclude: config.exclude ?? [],
        ignorePatterns: [...(config.ignorePatterns ?? []), ...(options.ignorePatterns ?? [])]
      });

  const sourceSignals = await Promise.all(
    filePaths.map(async (filePath) => {
      const content = await readFile(filePath, 'utf8');
      return scanSourceFile(filePath, content);
    })
  );

  const includeDependencies = options.includeDependencies ?? true;
  const depAnalysis = includeDependencies
    ? await analyzeDependencies(configBasePath, new Set(config.packageIgnoreList ?? []))
    : {
        packageSignals: [],
        fileSignals: [],
        dependencyChains: [],
        rootProjectName: path.basename(targetPath)
      };

  const ruleContext: RuleContext = {
    sourceSignals,
    dependencySignals: depAnalysis.fileSignals,
    packageSignals: depAnalysis.packageSignals,
    targets: selectedTargets,
    severityOverrides: config.severityOverrides ?? {},
    rootProjectName: depAnalysis.rootProjectName
  };

  const { issues } = runRules(ruleContext, config, targetPath);

  const metadata = {
    analyzedPath: targetPath,
    generatedAt: new Date().toISOString(),
    version: VERSION,
    targets: selectedTargets.map((target) => target.id),
    configUsed: config,
    configPath: loadedConfigPath
  };

  const summary = summarize(issues, metadata.targets);
  const runtimeMatrix = buildRuntimeMatrix(issues, metadata.targets);

  return {
    metadata,
    issues,
    summary,
    runtimeMatrix,
    dependencyChains: depAnalysis.dependencyChains,
    packageSignals: depAnalysis.packageSignals
  };
}

export async function analyzeFileContent(filePath: string, content: string, options?: Omit<AnalyzeOptions, 'path'>): Promise<AnalysisResult> {
  const cwd = options?.cwd ? path.resolve(options.cwd) : process.cwd();
  const selectedTargets = applyRuntimeAssumptions(resolveTargetsStrict(options?.targets), options?.configOverrides?.runtimeAssumptions);
  const signal = await scanSourceFile(path.resolve(cwd, filePath), content);

  const config = applyRuleOverrides(
    mergeConfig(
      {
        targets: selectedTargets.map((target) => target.id),
        include: [],
        exclude: [],
        ignorePatterns: [],
        disabledRules: [],
        enabledRules: [],
        severityOverrides: {},
        packageIgnoreList: [],
        allowlist: [],
        defaultReportFormat: 'pretty',
        failOnWarning: false
      },
      options?.configOverrides
    ),
    options?.ruleOverrides
  );

  const { issues } = runRules(
    {
      sourceSignals: [signal],
      dependencySignals: [],
      packageSignals: [],
      targets: selectedTargets,
      severityOverrides: config.severityOverrides ?? {},
      rootProjectName: path.basename(cwd)
    },
    config,
    cwd
  );

  const metadataTargets = selectedTargets.map((target) => target.id);
  return {
    metadata: {
      analyzedPath: path.resolve(cwd, filePath),
      generatedAt: new Date().toISOString(),
      version: VERSION,
      targets: metadataTargets,
      configUsed: config
    },
    issues,
    summary: summarize(issues, metadataTargets),
    runtimeMatrix: buildRuntimeMatrix(issues, metadataTargets),
    dependencyChains: [],
    packageSignals: []
  };
}

export function listRules() {
  return listRuleMeta();
}



