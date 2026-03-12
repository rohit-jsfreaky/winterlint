import path from 'node:path';
import { WinterlintConfig, Issue } from '../../types.js';
import { allRules } from './builtinRules.js';
import { RuleContext, RuleDefinition } from './ruleTypes.js';

function selectRules(config: WinterlintConfig): RuleDefinition[] {
  const rules = allRules();
  const enabled = new Set(config.enabledRules ?? []);
  const disabled = new Set(config.disabledRules ?? []);

  return rules.filter((rule) => {
    if (enabled.size > 0 && !enabled.has(rule.meta.id)) {
      return false;
    }
    if (disabled.has(rule.meta.id)) {
      return false;
    }
    return true;
  });
}

function applyAllowlist(issues: Issue[], config: WinterlintConfig, rootPath: string): Issue[] {
  const allowlist = config.allowlist ?? [];
  if (allowlist.length === 0) {
    return issues;
  }

  return issues.filter((issue) => {
    for (const entry of allowlist) {
      if (entry.ruleId !== issue.ruleId) {
        continue;
      }

      if (entry.package && issue.packageName && entry.package !== issue.packageName) {
        continue;
      }

      if (entry.path && issue.location) {
        const normalizedIssuePath = path.relative(rootPath, issue.location.filePath).replace(/\\/g, '/');
        if (!normalizedIssuePath.includes(entry.path.replace(/\\/g, '/'))) {
          continue;
        }
      }

      return false;
    }
    return true;
  });
}

export function runRules(context: RuleContext, config: WinterlintConfig, rootPath: string): { issues: Issue[]; usedRuleIds: string[] } {
  const rules = selectRules(config);
  const issues = rules.flatMap((rule) => rule.run(context));

  const filtered = applyAllowlist(issues, config, rootPath).filter((issue) => issue.affectedTargets.length > 0);

  return {
    issues: filtered,
    usedRuleIds: rules.map((rule) => rule.meta.id)
  };
}
