import { Issue, RuleMeta, RuntimeTarget, Severity, SourceSignal, PackageSignal } from '../../types.js';
import { DependencyFileSignal } from '../dependencyGraph.js';

export interface RuleContext {
  sourceSignals: SourceSignal[];
  dependencySignals: DependencyFileSignal[];
  packageSignals: PackageSignal[];
  targets: RuntimeTarget[];
  severityOverrides: Record<string, Severity>;
}

export interface RuleDefinition {
  meta: RuleMeta;
  run: (context: RuleContext) => Issue[];
}

export function effectiveSeverity(ruleId: string, defaultSeverity: Severity, overrides: Record<string, Severity>): Severity {
  return overrides[ruleId] ?? defaultSeverity;
}
