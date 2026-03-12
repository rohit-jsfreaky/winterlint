import path from 'node:path';
import { ReportContext } from '../types.js';

export function formatCompactReport(context: ReportContext): string {
  const { result } = context;
  if (result.issues.length === 0) {
    return `winterlint: PASS (${result.metadata.targets.join(', ')})`;
  }

  const lines = result.issues.map((issue) => {
    const rel = issue.location ? path.relative(result.metadata.analyzedPath, issue.location.filePath) : '(package)';
    const pos = issue.location ? `:${issue.location.line}:${issue.location.column}` : '';
    return `${issue.severity.toUpperCase()} ${issue.ruleId} ${rel}${pos} ${issue.message}`;
  });

  return lines.join('\n');
}
