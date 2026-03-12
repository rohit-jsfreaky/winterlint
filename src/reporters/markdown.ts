import path from 'node:path';
import { ReportContext } from '../types.js';

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
  lines.push('');

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
