import { ReportContext } from '../types.js';

export function formatJsonReport(context: ReportContext): string {
  return JSON.stringify(context.result, null, 2);
}
