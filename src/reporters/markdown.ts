import path from 'node:path';
import { ReportContext } from '../types.js';

function topRecord(record: Record<string, number>, limit = 5): Array<[string, number]> {
  return Object.entries(record)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit);
}

export function formatMarkdownReport(context: ReportContext): string {
  const { result } = context;
  const lines: string[] = [];

  lines.push('# winterlint report');
  lines.push('');
  lines.push(`- Analyzed path: \`${result.metadata.analyzedPath}\``);
  lines.push(`- Targets: ${result.metadata.targets.map((target) => `\`${target}\``).join(', ')}`);
  lines.push(
    `- Summary: ${result.summary.totalIssues} issues (error: ${result.summary.bySeverity.error}, warn: ${result.summary.bySeverity.warn}, info: ${result.summary.bySeverity.info})`
  );
  if (result.metadata.configPath) {
    lines.push(`- Config: \`${result.metadata.configPath}\``);
  }
  lines.push('');

  const topCategories = topRecord(result.summary.byCategory);
  if (topCategories.length > 0) {
    lines.push('## Top Categories');
    for (const [category, count] of topCategories) {
      lines.push(`- ${category}: ${count}`);
    }
    lines.push('');
  }

  if (result.summary.topOffendingPackages.length > 0) {
    lines.push('## Top Offending Packages');
    for (const item of result.summary.topOffendingPackages) {
      lines.push(`- ${item.name}: ${item.count}`);
    }
    lines.push('');
  }

  if (result.summary.topOffendingFiles.length > 0) {
    lines.push('## Top Offending Files');
    for (const item of result.summary.topOffendingFiles) {
      lines.push(`- ${path.relative(result.metadata.analyzedPath, item.path)}: ${item.count}`);
    }
    lines.push('');
  }

  lines.push('## Runtime Matrix');
  for (const row of result.runtimeMatrix) {
    lines.push(`- ${row.target}: ${row.pass ? 'PASS' : 'FAIL'} (${row.issueCount} issues)`);
  }
  lines.push('');

  if (result.issues.length === 0) {
    lines.push('## Issues');
    lines.push('No issues found.');
    return lines.join('\n');
  }

  lines.push('## Issues');
  for (const issue of result.issues) {
    const rel = issue.location ? path.relative(result.metadata.analyzedPath, issue.location.filePath) : '(package metadata)';
    lines.push(`- **${issue.ruleId}** (${issue.severity})`);
    lines.push(`  - Message: ${issue.message}`);
    lines.push(`  - File: ${rel}`);
    lines.push(`  - Targets: ${issue.affectedTargets.join(', ')}`);
    if (issue.dependencyBlame) {
      lines.push(`  - Dependency chain: ${issue.dependencyBlame.chain.join(' -> ')}`);
    }
    lines.push(`  - Recommendation: ${issue.recommendation}`);
  }

  return lines.join('\n');
}
