import path from 'node:path';
import { ReportContext } from '../types.js';

function severityGlyph(severity: string): string {
  if (severity === 'error') {
    return 'E';
  }
  if (severity === 'warn') {
    return 'W';
  }
  return 'I';
}

function sortedEntries(record: Record<string, number>): Array<[string, number]> {
  return Object.entries(record).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

export function formatPrettyReport(context: ReportContext): string {
  const { result } = context;
  const lines: string[] = [];

  lines.push(`winterlint ${result.metadata.version}`);
  lines.push(`Analyzed: ${result.metadata.analyzedPath}`);
  lines.push(`Targets: ${result.metadata.targets.join(', ')}`);
  if (result.metadata.configPath) {
    lines.push(`Config: ${result.metadata.configPath}`);
  }
  lines.push('');

  lines.push(
    `Summary: ${result.summary.totalIssues} issues ` +
      `(error: ${result.summary.bySeverity.error}, warn: ${result.summary.bySeverity.warn}, info: ${result.summary.bySeverity.info})`
  );

  const topCategories = sortedEntries(result.summary.byCategory).slice(0, 5);
  if (topCategories.length > 0) {
    lines.push(`Top categories: ${topCategories.map(([name, count]) => `${name}=${count}`).join(', ')}`);
  }

  if (result.summary.topOffendingPackages.length > 0) {
    lines.push(`Top packages: ${result.summary.topOffendingPackages.map((item) => `${item.name}=${item.count}`).join(', ')}`);
  }

  if (result.summary.topOffendingFiles.length > 0) {
    lines.push(`Top files: ${result.summary.topOffendingFiles.map((item) => `${path.relative(result.metadata.analyzedPath, item.path)}=${item.count}`).join(', ')}`);
  }

  lines.push('Runtime Matrix:');
  for (const row of result.runtimeMatrix) {
    lines.push(`  - ${row.target}: ${row.pass ? 'PASS' : 'FAIL'} (${row.issueCount} issues, ${row.errorCount} errors, ${row.warnCount} warns)`);
  }

  if (result.issues.length === 0) {
    lines.push('');
    lines.push('No portability issues found.');
    return lines.join('\n');
  }

  lines.push('');
  lines.push('Issues:');
  for (const issue of result.issues) {
    const file = issue.location ? path.relative(result.metadata.analyzedPath, issue.location.filePath) : '(package metadata)';
    const where = issue.location ? `${file}:${issue.location.line}:${issue.location.column}` : file;
    lines.push(`[${severityGlyph(issue.severity)}] ${issue.ruleId} -> ${issue.message}`);
    lines.push(`  severity=${issue.severity} category=${issue.category} confidence=${issue.confidence}`);
    lines.push(`  location=${where}`);
    lines.push(`  affects=${issue.affectedTargets.join(', ')}`);
    if (issue.packageName) {
      lines.push(`  package=${issue.packageName}`);
    }
    if (issue.dependencyBlame) {
      lines.push(`  blame=${issue.dependencyBlame.chain.join(' -> ')}`);
    }
    lines.push(`  why=${issue.explanation}`);
    lines.push(`  next=${issue.recommendation}`);
  }

  return lines.join('\n');
}
