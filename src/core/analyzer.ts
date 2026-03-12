import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { AnalyzeOptions, AnalysisResult, AnalysisSummary, RuntimeMatrix, RuntimeTargetId, WinterlintConfig } from '../types.js';
import { collectSourceFiles } from './collectFiles.js';
import { scanSourceFile } from './fileScanner.js';
import { analyzeDependencies } from './dependencyGraph.js';
import { runRules } from './rules/engine.js';
import { listRuleMeta } from './rules/builtinRules.js';
import { loadConfig } from '../config/index.js';
import { resolveTargets } from '../targets/index.js';
import { RuleContext } from './rules/ruleTypes.js';

const VERSION = '0.1.0';

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

function summarize(resultIssues: AnalysisResult['issues'], targets: RuntimeTargetId[]): AnalysisSummary {
  const bySeverity: AnalysisSummary['bySeverity'] = {
    error: 0,
    warn: 0,
    info: 0
  };

  const byTarget = Object.fromEntries(targets.map((target) => [target, 0])) as AnalysisSummary['byTarget'];
  const byCategory: AnalysisSummary['byCategory'] = {};

  for (const issue of resultIssues) {
    bySeverity[issue.severity] += 1;
    for (const target of issue.affectedTargets) {
      byTarget[target] = (byTarget[target] ?? 0) + 1;
    }
    byCategory[issue.category] = (byCategory[issue.category] ?? 0) + 1;
  }

  return {
    totalIssues: resultIssues.length,
    bySeverity,
    byTarget,
    byCategory
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

export async function analyzeProject(options: AnalyzeOptions): Promise<AnalysisResult> {
  const cwd = options.cwd ? path.resolve(options.cwd) : process.cwd();
  const targetPath = path.resolve(cwd, options.path);
  const configBasePath = options.fileMode ? path.dirname(targetPath) : targetPath;
  const { config: loadedConfig } = await loadConfig(configBasePath, options.configPath);
  const merged = mergeConfig(loadedConfig, options.configOverrides);
  const config = applyRuleOverrides(merged, options.ruleOverrides);

  const selectedTargets = resolveTargets(options.targets ?? config.targets);
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
    severityOverrides: config.severityOverrides ?? {}
  };

  const { issues } = runRules(ruleContext, config, targetPath);

  const metadata = {
    analyzedPath: targetPath,
    generatedAt: new Date().toISOString(),
    version: VERSION,
    targets: selectedTargets.map((target) => target.id),
    configUsed: config
  };

  const summary = summarize(issues, metadata.targets);
  const runtimeMatrix = buildRuntimeMatrix(issues, metadata.targets);

  const result: AnalysisResult = {
    metadata,
    issues,
    summary,
    runtimeMatrix,
    dependencyChains: depAnalysis.dependencyChains,
    packageSignals: depAnalysis.packageSignals
  };

  return result;
}

export async function analyzeFileContent(filePath: string, content: string, options?: Omit<AnalyzeOptions, 'path'>): Promise<AnalysisResult> {
  const cwd = options?.cwd ? path.resolve(options.cwd) : process.cwd();
  const targets = resolveTargets(options?.targets);
  const signal = await scanSourceFile(path.resolve(cwd, filePath), content);

  const config = applyRuleOverrides(
    mergeConfig(
      {
        targets: targets.map((target) => target.id),
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
      targets,
      severityOverrides: config.severityOverrides ?? {}
    },
    config,
    cwd
  );

  const metadataTargets = targets.map((target) => target.id);
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


