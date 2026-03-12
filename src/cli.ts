#!/usr/bin/env node
import { Command } from 'commander';
import { analyzeProject, listRules } from './core/analyzer.js';
import { findRule } from './core/rules/builtinRules.js';
import { listTargets, resolveTargets } from './targets/index.js';
import { formatReport, ReportFormat } from './reporters/index.js';
import { loadConfig } from './config/index.js';
import { writeFile, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { WinterlintConfig } from './types.js';

const VERSION = '1.0.0';

interface AnalyzeCliOptions {
  file?: boolean;
  target?: string[];
  format?: ReportFormat;
  json?: boolean;
  quiet?: boolean;
  verbose?: boolean;
  config?: string;
  ignore?: string[];
  rule?: string[];
  failOnWarning?: boolean;
  maxIssues?: string;
  noDeps?: boolean;
}

function parseRuleOverrides(entries: string[] | undefined): Record<string, 'off' | 'error' | 'warn' | 'info'> {
  const output: Record<string, 'off' | 'error' | 'warn' | 'info'> = {};
  if (!entries) {
    return output;
  }

  for (const item of entries) {
    const [ruleId, value] = item.split('=');
    if (!ruleId || !value || !['off', 'error', 'warn', 'info'].includes(value)) {
      throw new Error(`Invalid --rule value "${item}". Expected <rule-id>=off|error|warn|info`);
    }
    output[ruleId] = value as 'off' | 'error' | 'warn' | 'info';
  }

  return output;
}

function parseTargets(entries: string[] | undefined): string[] | undefined {
  if (!entries || entries.length === 0) {
    return undefined;
  }

  const parsed = entries
    .flatMap((entry) => entry.split(','))
    .map((value) => value.trim())
    .filter(Boolean);

  const unknown = parsed.filter((name) => !resolveTargets([name]).length);
  if (unknown.length > 0) {
    throw new Error(`Unknown target(s): ${unknown.join(', ')}`);
  }

  return parsed;
}

function shouldFail(result: Awaited<ReturnType<typeof analyzeProject>>, config: WinterlintConfig): boolean {
  if (result.summary.bySeverity.error > 0) {
    return true;
  }
  if (config.failOnWarning && result.summary.bySeverity.warn > 0) {
    return true;
  }
  if (config.maxIssues !== undefined && result.summary.totalIssues > config.maxIssues) {
    return true;
  }
  return false;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function runAnalyze(targetPath: string, options: AnalyzeCliOptions): Promise<number> {
  const ruleOverrides = parseRuleOverrides(options.rule);
  const selectedTargets = parseTargets(options.target);

  const configOverrides: WinterlintConfig = {};
  if (options.failOnWarning !== undefined) {
    configOverrides.failOnWarning = options.failOnWarning;
  }
  if (options.maxIssues !== undefined) {
    const parsedMaxIssues = Number(options.maxIssues);
    if (!Number.isFinite(parsedMaxIssues) || parsedMaxIssues < 0) {
      throw new Error('--max-issues must be a non-negative number');
    }
    configOverrides.maxIssues = Math.floor(parsedMaxIssues);
  }

  const result = await analyzeProject({
    path: targetPath,
    fileMode: options.file,
    targets: selectedTargets as WinterlintConfig['targets'],
    configPath: options.config,
    quiet: options.quiet,
    verbose: options.verbose,
    includeDependencies: options.noDeps ? false : true,
    ignorePatterns: options.ignore,
    ruleOverrides,
    configOverrides
  });

  const format = options.json ? 'json' : options.format ?? result.metadata.configUsed.defaultReportFormat ?? 'pretty';
  const output = formatReport({ result, rules: listRules() }, format);

  if (!options.quiet || format === 'json') {
    process.stdout.write(`${output}\n`);
  } else {
    process.stdout.write(`winterlint: ${result.summary.totalIssues} issues\n`);
  }

  return shouldFail(result, {
    ...result.metadata.configUsed,
    ...configOverrides
  })
    ? 1
    : 0;
}

async function runExplain(ruleId: string): Promise<number> {
  const rule = findRule(ruleId);
  if (!rule) {
    process.stderr.write(`Unknown rule: ${ruleId}\n`);
    return 1;
  }

  const lines = [
    `${rule.meta.id}`,
    `${rule.meta.title}`,
    `Category: ${rule.meta.category}`,
    `Default severity: ${rule.meta.defaultSeverity}`,
    '',
    rule.meta.description,
    '',
    `Why: ${rule.meta.explanation}`,
    `Next: ${rule.meta.recommendation}`
  ];

  process.stdout.write(`${lines.join('\n')}\n`);
  return 0;
}

async function runInit(targetDir: string): Promise<number> {
  const absDir = path.resolve(targetDir);
  const configPath = path.join(absDir, 'winterlint.config.json');
  if (await fileExists(configPath)) {
    process.stderr.write(`Config already exists: ${configPath}\n`);
    return 1;
  }

  const { config } = await loadConfig(absDir);
  const sample: WinterlintConfig = {
    ...config,
    targets: ['node', 'cloudflare-workers', 'vercel-edge', 'wintertc'],
    ignorePatterns: ['**/*.test.ts'],
    severityOverrides: {
      'runtime-conditional-code/unsafe-runtime-branching': 'warn'
    }
  };

  await writeFile(configPath, `${JSON.stringify(sample, null, 2)}\n`, 'utf8');
  process.stdout.write(`Created ${configPath}\n`);
  return 0;
}

export async function runCli(argv: string[]): Promise<number> {
  const program = new Command();

  program.name('winterlint').description('Runtime portability analyzer for Node, Edge, Deno, Bun and WinterTC targets.').version(VERSION);

  program
    .command('analyze [path]')
    .description('Analyze a project directory or single file for runtime portability issues.')
    .option('--file', 'Treat path as a single file')
    .option('-t, --target <target...>', 'Analyze specific target runtime(s), comma-separated or repeated')
    .option('-f, --format <format>', 'Output format: pretty|json|compact|markdown')
    .option('--json', 'Shortcut for --format json')
    .option('--quiet', 'Suppress human verbose output')
    .option('--verbose', 'Enable verbose analysis output')
    .option('-c, --config <path>', 'Explicit config file path')
    .option('--ignore <pattern...>', 'Ignore glob patterns')
    .option('--rule <rule=level...>', 'Rule override, e.g. node-builtins/no-unsupported-import=warn')
    .option('--fail-on-warning', 'Exit non-zero when warnings exist')
    .option('--max-issues <count>', 'Exit non-zero if issue count exceeds threshold')
    .option('--no-deps', 'Skip dependency graph analysis')
    .action(async (targetPath: string | undefined, opts: AnalyzeCliOptions) => {
      try {
        const code = await runAnalyze(targetPath ?? '.', opts);
        process.exitCode = code;
      } catch (error) {
        process.stderr.write(`winterlint analyze failed: ${(error as Error).message}\n`);
        process.exitCode = 1;
      }
    });

  program
    .command('explain <ruleId>')
    .description('Show detailed explanation and recommendation for a rule ID.')
    .action(async (ruleId: string) => {
      process.exitCode = await runExplain(ruleId);
    });

  program
    .command('list-rules')
    .description('List all built-in rule definitions.')
    .option('--json', 'Print rules as JSON')
    .action((opts: { json?: boolean }) => {
      const rules = listRules();
      if (opts.json) {
        process.stdout.write(`${JSON.stringify(rules, null, 2)}\n`);
        return;
      }
      for (const rule of rules) {
        process.stdout.write(`${rule.id} | ${rule.defaultSeverity} | ${rule.category} | ${rule.title}\n`);
      }
    });

  program
    .command('list-targets')
    .description('List all supported runtime target profiles.')
    .option('--json', 'Print targets as JSON')
    .action((opts: { json?: boolean }) => {
      const targets = listTargets();
      if (opts.json) {
        process.stdout.write(`${JSON.stringify(targets, null, 2)}\n`);
        return;
      }
      for (const target of targets) {
        process.stdout.write(`${target.id} | ${target.name} | ${target.family} | aliases: ${target.aliases.join(', ') || '-'}\n`);
      }
    });

  program
    .command('init [path]')
    .description('Generate winterlint.config.json in a project directory.')
    .action(async (targetPath: string | undefined) => {
      process.exitCode = await runInit(targetPath ?? '.');
    });

  program
    .command('help-targets')
    .description('Alias command to print runtime target list with notes.')
    .action(() => {
      for (const target of listTargets()) {
        process.stdout.write(`${target.id}: ${target.notes}\n`);
      }
    });

  await program.parseAsync(argv, { from: 'user' });
  const exitCode = process.exitCode;
  return typeof exitCode === 'number' ? exitCode : 0;
}

if (process.argv[1] && process.argv[1].endsWith('cli.js')) {
  runCli(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`winterlint failed: ${(error as Error).message}\n`);
    process.exit(1);
  });
}


