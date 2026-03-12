import { ReportContext } from '../types.js';
import { formatPrettyReport } from './pretty.js';
import { formatJsonReport } from './json.js';
import { formatCompactReport } from './compact.js';
import { formatMarkdownReport } from './markdown.js';

export type ReportFormat = 'pretty' | 'json' | 'compact' | 'markdown';

export function formatReport(context: ReportContext, format: ReportFormat): string {
  switch (format) {
    case 'json':
      return formatJsonReport(context);
    case 'compact':
      return formatCompactReport(context);
    case 'markdown':
      return formatMarkdownReport(context);
    case 'pretty':
    default:
      return formatPrettyReport(context);
  }
}
