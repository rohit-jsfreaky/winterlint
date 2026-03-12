import path from 'node:path';
import { Issue, RuntimeTarget, RuntimeTargetId, SourceSignal } from '../../types.js';
import { NODE_BUILTIN_SET, NETWORK_NODE_APIS } from '../../targets/index.js';
import { RuleDefinition, effectiveSeverity } from './ruleTypes.js';
import { DependencyFileSignal } from '../dependencyGraph.js';

const EDGE_LIKE_TARGETS = new Set<RuntimeTargetId>(['cloudflare-workers', 'vercel-edge', 'wintertc', 'winterjs']);

function targetsFailing(targets: RuntimeTarget[], predicate: (target: RuntimeTarget) => boolean): RuntimeTargetId[] {
  return targets.filter(predicate).map((target) => target.id);
}

function createIssue(
  args: {
    rule: RuleDefinition;
    index: number;
    message: string;
    affectedTargets: RuntimeTargetId[];
    sourceType: Issue['sourceType'];
    location?: Issue['location'];
    packageName?: string;
    dependencyBlame?: Issue['dependencyBlame'];
    metadata?: Issue['metadata'];
  },
  severityOverrides: Record<string, Issue['severity']>
): Issue {
  return {
    id: `${args.rule.meta.id}:${args.index}`,
    ruleId: args.rule.meta.id,
    ruleTitle: args.rule.meta.title,
    category: args.rule.meta.category,
    severity: effectiveSeverity(args.rule.meta.id, args.rule.meta.defaultSeverity, severityOverrides),
    confidence: args.rule.meta.confidence ?? 'medium',
    message: args.message,
    explanation: args.rule.meta.explanation,
    recommendation: args.rule.meta.recommendation,
    affectedTargets: args.affectedTargets,
    sourceType: args.sourceType,
    location: args.location,
    packageName: args.packageName,
    dependencyBlame: args.dependencyBlame,
    metadata: args.metadata
  };
}

function findBuiltin(specifier: string): string | undefined {
  if (specifier.startsWith('node:')) {
    return specifier.slice(5);
  }
  return NODE_BUILTIN_SET.has(specifier) ? specifier : undefined;
}

function* iterateSourceSignals(sourceSignals: SourceSignal[]): Generator<{ signal: SourceSignal; packageName?: string; chain?: string[]; sourceType: Issue['sourceType'] }> {
  for (const signal of sourceSignals) {
    yield { signal, sourceType: 'source' };
  }
}

function* iterateDependencySignals(dependencySignals: DependencyFileSignal[]): Generator<{ signal: SourceSignal; packageName: string; chain: string[]; sourceType: Issue['sourceType'] }> {
  for (const depSignal of dependencySignals) {
    yield {
      signal: depSignal.signal,
      packageName: depSignal.packageName,
      chain: depSignal.chain,
      sourceType: 'dependency'
    };
  }
}

const RULES: RuleDefinition[] = [];

const nodeBuiltinImportRule: RuleDefinition = {
  meta: {
    id: 'node-builtins/no-unsupported-import',
    title: 'Unsupported Node builtin import',
    description: 'Flags imports of Node core modules for runtimes that do not support them.',
    category: 'node-builtins',
    defaultSeverity: 'error',
    confidence: 'high',
    explanation: 'Edge and baseline runtimes usually do not expose Node core modules.',
    recommendation: 'Replace Node builtin usage with Web APIs or runtime-specific adapters.',
    docsUrl: 'docs/rules.md#node-builtinsno-unsupported-import'
  },
  run(context) {
    const issues: Issue[] = [];
    let index = 0;

    const processSignal = (signal: SourceSignal, sourceType: Issue['sourceType'], packageName?: string, chain?: string[]) => {
      for (const imp of signal.imports) {
        const builtin = findBuiltin(imp.specifier);
        if (!builtin) {
          continue;
        }

        const affectedTargets = targetsFailing(context.targets, (target) => !target.supportsNodeBuiltins || !target.supportedNodeBuiltins.includes(builtin));
        if (affectedTargets.length === 0) {
          continue;
        }

        issues.push(
          createIssue(
            {
              rule: nodeBuiltinImportRule,
              index: ++index,
              message: `Import of Node builtin "${builtin}" is not portable to selected targets.`,
              affectedTargets,
              sourceType,
              packageName,
              location: {
                filePath: signal.filePath,
                line: imp.line,
                column: imp.column
              },
              dependencyBlame: sourceType === 'dependency' && packageName && chain
                ? {
                    rootProject: chain[0] ?? 'root',
                    chain,
                    offendingPackage: packageName,
                    offendingFile: signal.filePath
                  }
                : undefined,
              metadata: {
                importSpecifier: imp.specifier
              }
            },
            context.severityOverrides
          )
        );
      }
    };

    for (const source of iterateSourceSignals(context.sourceSignals)) {
      processSignal(source.signal, source.sourceType);
    }

    for (const dep of iterateDependencySignals(context.dependencySignals)) {
      processSignal(dep.signal, dep.sourceType, dep.packageName, dep.chain);
    }

    return issues;
  }
};
RULES.push(nodeBuiltinImportRule);

const filesystemRule: RuleDefinition = {
  meta: {
    id: 'filesystem/no-fs-usage',
    title: 'Filesystem API assumption',
    description: 'Detects fs usage that breaks in edge and baseline runtimes.',
    category: 'filesystem',
    defaultSeverity: 'error',
    confidence: 'high',
    explanation: 'Most edge runtimes do not provide disk access at runtime.',
    recommendation: 'Use fetch, KV/object storage, or runtime-provided bindings instead of fs.',
    docsUrl: 'docs/rules.md#filesystemno-fs-usage'
  },
  run(context) {
    const issues: Issue[] = [];
    let index = 0;
    const affectedTargets = targetsFailing(context.targets, (target) => !target.supportsFileSystem);
    if (affectedTargets.length === 0) {
      return issues;
    }

    const handleSignal = (signal: SourceSignal, sourceType: Issue['sourceType'], packageName?: string, chain?: string[]) => {
      for (const imp of signal.imports) {
        const builtin = findBuiltin(imp.specifier);
        if (builtin !== 'fs') {
          continue;
        }
        issues.push(
          createIssue(
            {
              rule: filesystemRule,
              index: ++index,
              message: 'Filesystem dependency found; selected targets may not provide runtime filesystem access.',
              affectedTargets,
              sourceType,
              packageName,
              location: {
                filePath: signal.filePath,
                line: imp.line,
                column: imp.column
              },
              dependencyBlame: sourceType === 'dependency' && packageName && chain
                ? {
                    rootProject: chain[0] ?? 'root',
                    chain,
                    offendingPackage: packageName,
                    offendingFile: signal.filePath
                  }
                : undefined
            },
            context.severityOverrides
          )
        );
      }
    };

    for (const src of iterateSourceSignals(context.sourceSignals)) {
      handleSignal(src.signal, 'source');
    }
    for (const dep of iterateDependencySignals(context.dependencySignals)) {
      handleSignal(dep.signal, 'dependency', dep.packageName, dep.chain);
    }

    return issues;
  }
};
RULES.push(filesystemRule);

const childProcessRule: RuleDefinition = {
  meta: {
    id: 'networking/no-child-process',
    title: 'Child process usage',
    description: 'Flags use of child_process in runtimes where process spawning is unavailable.',
    category: 'networking',
    defaultSeverity: 'error',
    confidence: 'high',
    explanation: 'Edge isolates and baseline runtimes cannot spawn OS subprocesses.',
    recommendation: 'Move shelling-out logic to a Node service or remove runtime shell dependencies.'
  },
  run(context) {
    const issues: Issue[] = [];
    const affectedTargets = targetsFailing(context.targets, (target) => !target.supportsChildProcess);
    let index = 0;

    const inspect = (signal: SourceSignal, sourceType: Issue['sourceType']) => {
      for (const imp of signal.imports) {
        if (findBuiltin(imp.specifier) !== 'child_process') {
          continue;
        }
        issues.push(
          createIssue(
            {
              rule: childProcessRule,
              index: ++index,
              message: 'child_process is not available in selected edge/baseline targets.',
              affectedTargets,
              sourceType,
              location: {
                filePath: signal.filePath,
                line: imp.line,
                column: imp.column
              }
            },
            context.severityOverrides
          )
        );
      }
    };

    for (const src of context.sourceSignals) {
      inspect(src, 'source');
    }
    for (const dep of context.dependencySignals) {
      inspect(dep.signal, 'dependency');
    }

    return issues;
  }
};
RULES.push(childProcessRule);

const networkSocketRule: RuleDefinition = {
  meta: {
    id: 'networking/no-raw-sockets',
    title: 'Raw socket API usage',
    description: 'Detects net/tls/dgram assumptions that fail in edge runtimes.',
    category: 'networking',
    defaultSeverity: 'error',
    confidence: 'high',
    explanation: 'Most edge runtimes disallow arbitrary TCP/UDP sockets.',
    recommendation: 'Use fetch/WebSocket or runtime-approved outbound APIs.'
  },
  run(context) {
    const issues: Issue[] = [];
    const affectedTargets = targetsFailing(context.targets, (target) => !target.supportsTcpSockets);
    let index = 0;

    for (const sourceType of ['source', 'dependency'] as const) {
      const signals = sourceType === 'source' ? context.sourceSignals : context.dependencySignals.map((dep) => dep.signal);
      for (const signal of signals) {
        for (const imp of signal.imports) {
          const builtin = findBuiltin(imp.specifier);
          if (!builtin || !NETWORK_NODE_APIS.has(builtin)) {
            continue;
          }
          issues.push(
            createIssue(
              {
                rule: networkSocketRule,
                index: ++index,
                message: `Module "${builtin}" assumes raw socket access unavailable in selected targets.`,
                affectedTargets,
                sourceType,
                location: {
                  filePath: signal.filePath,
                  line: imp.line,
                  column: imp.column
                }
              },
              context.severityOverrides
            )
          );
        }
      }
    }

    return issues;
  }
};
RULES.push(networkSocketRule);

const clusterRule: RuleDefinition = {
  meta: {
    id: 'node-builtins/no-cluster',
    title: 'Cluster API usage',
    description: 'Detects use of cluster module in non-Node targets.',
    category: 'node-builtins',
    defaultSeverity: 'error',
    confidence: 'high',
    explanation: 'Cluster depends on multi-process Node internals unavailable outside Node.',
    recommendation: 'Use platform scaling or worker APIs instead of cluster.'
  },
  run(context) {
    const issues: Issue[] = [];
    const affectedTargets = targetsFailing(context.targets, (target) => target.id !== 'node' && target.id !== 'bun');
    let index = 0;

    for (const signal of context.sourceSignals) {
      for (const imp of signal.imports) {
        if (findBuiltin(imp.specifier) !== 'cluster') {
          continue;
        }
        issues.push(
          createIssue(
            {
              rule: clusterRule,
              index: ++index,
              message: 'cluster is Node-specific and not portable across edge/baseline runtimes.',
              affectedTargets,
              sourceType: 'source',
              location: {
                filePath: signal.filePath,
                line: imp.line,
                column: imp.column
              }
            },
            context.severityOverrides
          )
        );
      }
    }

    return issues;
  }
};
RULES.push(clusterRule);

const workerThreadsRule: RuleDefinition = {
  meta: {
    id: 'node-builtins/no-worker-threads',
    title: 'worker_threads assumption',
    description: 'Detects worker_threads dependency for targets without Node worker_threads.',
    category: 'node-builtins',
    defaultSeverity: 'warn',
    confidence: 'medium',
    explanation: 'Some runtimes expose workers, but worker_threads semantics are Node-specific.',
    recommendation: 'Use Web Worker APIs or target-specific abstractions.'
  },
  run(context) {
    const issues: Issue[] = [];
    let index = 0;
    const affectedTargets = targetsFailing(context.targets, (target) => !target.supportsWorkerThreads || !target.supportsNodeBuiltins);

    for (const signal of context.sourceSignals) {
      for (const imp of signal.imports) {
        if (findBuiltin(imp.specifier) !== 'worker_threads') {
          continue;
        }
        issues.push(
          createIssue(
            {
              rule: workerThreadsRule,
              index: ++index,
              message: 'worker_threads is not consistently supported across selected targets.',
              affectedTargets,
              sourceType: 'source',
              location: {
                filePath: signal.filePath,
                line: imp.line,
                column: imp.column
              }
            },
            context.severityOverrides
          )
        );
      }
    }

    return issues;
  }
};
RULES.push(workerThreadsRule);

const dynamicRequireRule: RuleDefinition = {
  meta: {
    id: 'dynamic-loading/no-dynamic-require',
    title: 'Dynamic require/import',
    description: 'Detects runtime dynamic module loading patterns.',
    category: 'dynamic-loading',
    defaultSeverity: 'warn',
    confidence: 'medium',
    explanation: 'Dynamic loading can bypass static bundling and break edge deployments.',
    recommendation: 'Prefer static imports or explicit lazy modules with known paths.'
  },
  run(context) {
    const issues: Issue[] = [];
    let index = 0;
    const affectedTargets = context.targets.filter((target) => EDGE_LIKE_TARGETS.has(target.id) || target.id === 'deno').map((target) => target.id);

    for (const signal of context.sourceSignals) {
      for (const item of signal.dynamicRequire) {
        issues.push(
          createIssue(
            {
              rule: dynamicRequireRule,
              index: ++index,
              message: 'Dynamic require/import detected; resolution may fail in edge bundling/runtime.',
              affectedTargets,
              sourceType: 'source',
              location: {
                filePath: signal.filePath,
                line: item.line,
                column: item.column
              }
            },
            context.severityOverrides
          )
        );
      }
    }

    return issues;
  }
};
RULES.push(dynamicRequireRule);

const commonJsEntrypointRule: RuleDefinition = {
  meta: {
    id: 'commonjs/cjs-only-package',
    title: 'CommonJS-only package entry',
    description: 'Flags dependencies that only expose CJS entrypoints.',
    category: 'commonjs',
    defaultSeverity: 'warn',
    confidence: 'medium',
    explanation: 'Edge/baseline pipelines frequently expect ESM exports or worker conditions.',
    recommendation: 'Prefer dependencies with ESM or worker/browser conditional exports.'
  },
  run(context) {
    const issues: Issue[] = [];
    let index = 0;
    const affectedTargets = context.targets.filter((target) => target.id !== 'node' && target.id !== 'bun').map((target) => target.id);

    for (const pkg of context.packageSignals) {
      if (!pkg.isCommonJsOnly) {
        continue;
      }
      issues.push(
        createIssue(
          {
            rule: commonJsEntrypointRule,
            index: ++index,
            message: `Dependency "${pkg.packageName}" appears to expose only CommonJS entrypoints.`,
            affectedTargets,
            sourceType: 'dependency',
            packageName: pkg.packageName,
            location: {
              filePath: path.join(pkg.packagePath, 'package.json'),
              line: 1,
              column: 0
            },
            dependencyBlame: {
              rootProject: 'project',
              chain: ['project', pkg.packageName],
              offendingPackage: pkg.packageName,
              exportPath: pkg.entryFile
            }
          },
          context.severityOverrides
        )
      );
    }

    return issues;
  }
};
RULES.push(commonJsEntrypointRule);

const nativeAddonRule: RuleDefinition = {
  meta: {
    id: 'native-module/no-native-addon',
    title: 'Native addon dependency',
    description: 'Detects node-gyp or native addon indicators in dependencies.',
    category: 'native-module',
    defaultSeverity: 'error',
    confidence: 'medium',
    explanation: 'Native addons are generally unsupported in edge and sandboxed runtimes.',
    recommendation: 'Use pure JavaScript/WASM alternatives for portable builds.'
  },
  run(context) {
    const issues: Issue[] = [];
    let index = 0;
    const affectedTargets = context.targets.filter((target) => !target.supportsNativeAddons).map((target) => target.id);

    for (const pkg of context.packageSignals) {
      if (!pkg.hasNativeAddonSignals) {
        continue;
      }

      issues.push(
        createIssue(
          {
            rule: nativeAddonRule,
            index: ++index,
            message: `Dependency "${pkg.packageName}" has native addon signals (node-gyp/prebuild).`,
            affectedTargets,
            sourceType: 'dependency',
            packageName: pkg.packageName,
            location: {
              filePath: path.join(pkg.packagePath, 'package.json'),
              line: 1,
              column: 0
            },
            dependencyBlame: {
              rootProject: 'project',
              chain: ['project', pkg.packageName],
              offendingPackage: pkg.packageName
            }
          },
          context.severityOverrides
        )
      );
    }

    return issues;
  }
};
RULES.push(nativeAddonRule);

const processGlobalRule: RuleDefinition = {
  meta: {
    id: 'process-env/no-process-global',
    title: 'process global assumption',
    description: 'Flags unguarded process global usage.',
    category: 'process-env',
    defaultSeverity: 'warn',
    confidence: 'high',
    explanation: 'process is not guaranteed in WinterTC baseline and many edge runtimes.',
    recommendation: 'Use runtime configuration injection or feature detection guards.'
  },
  run(context) {
    const issues: Issue[] = [];
    const affectedTargets = targetsFailing(context.targets, (target) => !target.supportsProcessGlobal);
    let index = 0;

    for (const signal of context.sourceSignals) {
      for (const globalRef of signal.globals) {
        if (globalRef.name !== 'process') {
          continue;
        }
        issues.push(
          createIssue(
            {
              rule: processGlobalRule,
              index: ++index,
              message: 'Ungarded process usage may fail outside Node-like runtimes.',
              affectedTargets,
              sourceType: 'source',
              location: {
                filePath: signal.filePath,
                line: globalRef.line,
                column: globalRef.column
              }
            },
            context.severityOverrides
          )
        );
      }
    }

    return issues;
  }
};
RULES.push(processGlobalRule);

const bufferRule: RuleDefinition = {
  meta: {
    id: 'streams-and-buffer-assumptions/no-buffer-global',
    title: 'Buffer global assumption',
    description: 'Detects Buffer global usage for targets where it is not guaranteed.',
    category: 'streams-and-buffer-assumptions',
    defaultSeverity: 'warn',
    confidence: 'high',
    explanation: 'Buffer is a Node global and not universal across modern edge runtimes.',
    recommendation: 'Use Uint8Array/TextEncoder/TextDecoder or explicit Buffer polyfills.'
  },
  run(context) {
    const issues: Issue[] = [];
    const affectedTargets = targetsFailing(context.targets, (target) => !target.supportsBufferGlobal);
    let index = 0;

    for (const signal of context.sourceSignals) {
      for (const globalRef of signal.globals) {
        if (globalRef.name !== 'Buffer') {
          continue;
        }
        issues.push(
          createIssue(
            {
              rule: bufferRule,
              index: ++index,
              message: 'Buffer global usage detected without portability guard.',
              affectedTargets,
              sourceType: 'source',
              location: {
                filePath: signal.filePath,
                line: globalRef.line,
                column: globalRef.column
              }
            },
            context.severityOverrides
          )
        );
      }
    }

    return issues;
  }
};
RULES.push(bufferRule);

const webCryptoRule: RuleDefinition = {
  meta: {
    id: 'web-crypto-vs-node-crypto/prefer-web-crypto',
    title: 'Node crypto usage',
    description: 'Flags Node crypto module imports for web-first targets.',
    category: 'web-crypto-vs-node-crypto',
    defaultSeverity: 'warn',
    confidence: 'medium',
    explanation: 'Web Crypto is the portability baseline across edge runtimes.',
    recommendation: 'Use globalThis.crypto.subtle when practical for cross-runtime compatibility.'
  },
  run(context) {
    const issues: Issue[] = [];
    const affectedTargets = context.targets.filter((target) => target.prefersWebCrypto).map((target) => target.id);
    let index = 0;

    for (const signal of context.sourceSignals) {
      for (const imp of signal.imports) {
        if (findBuiltin(imp.specifier) !== 'crypto') {
          continue;
        }
        issues.push(
          createIssue(
            {
              rule: webCryptoRule,
              index: ++index,
              message: 'Node crypto module import detected; prefer Web Crypto for portable targets.',
              affectedTargets,
              sourceType: 'source',
              location: {
                filePath: signal.filePath,
                line: imp.line,
                column: imp.column
              }
            },
            context.severityOverrides
          )
        );
      }
    }

    return issues;
  }
};
RULES.push(webCryptoRule);

const evalRule: RuleDefinition = {
  meta: {
    id: 'eval-security/no-eval-like',
    title: 'Eval-like behavior',
    description: 'Detects eval/new Function use for restricted targets.',
    category: 'eval-security',
    defaultSeverity: 'warn',
    confidence: 'high',
    explanation: 'Some platforms restrict eval-like execution for security and optimization reasons.',
    recommendation: 'Replace dynamic code generation with static dispatch or parsed DSL handling.'
  },
  run(context) {
    const issues: Issue[] = [];
    const affectedTargets = targetsFailing(context.targets, (target) => !target.supportsEvalLike);
    let index = 0;

    for (const signal of context.sourceSignals) {
      for (const evalLike of signal.evalLike) {
        issues.push(
          createIssue(
            {
              rule: evalRule,
              index: ++index,
              message: `${evalLike.kind} detected; selected targets may disallow or sandbox eval-like execution.`,
              affectedTargets,
              sourceType: 'source',
              location: {
                filePath: signal.filePath,
                line: evalLike.line,
                column: evalLike.column
              }
            },
            context.severityOverrides
          )
        );
      }
    }

    return issues;
  }
};
RULES.push(evalRule);

const dirnameRule: RuleDefinition = {
  meta: {
    id: 'globals/no-dirname-filename',
    title: '__dirname / __filename usage',
    description: 'Detects CommonJS path globals not universal outside Node.',
    category: 'globals',
    defaultSeverity: 'warn',
    confidence: 'high',
    explanation: '__dirname and __filename are CJS conveniences and not provided in many runtimes/ESM contexts.',
    recommendation: 'Use import.meta.url and URL/fileURLToPath patterns where supported.'
  },
  run(context) {
    const issues: Issue[] = [];
    const affectedTargets = context.targets.filter((target) => target.id !== 'node' && target.id !== 'bun').map((target) => target.id);
    let index = 0;

    for (const signal of context.sourceSignals) {
      for (const globalRef of signal.globals) {
        if (globalRef.name !== '__dirname' && globalRef.name !== '__filename') {
          continue;
        }
        issues.push(
          createIssue(
            {
              rule: dirnameRule,
              index: ++index,
              message: `${globalRef.name} usage may break in ESM/edge runtimes.`,
              affectedTargets,
              sourceType: 'source',
              location: {
                filePath: signal.filePath,
                line: globalRef.line,
                column: globalRef.column
              }
            },
            context.severityOverrides
          )
        );
      }
    }

    return issues;
  }
};
RULES.push(dirnameRule);

const unresolvedImportRule: RuleDefinition = {
  meta: {
    id: 'resolution/unresolved-import',
    title: 'Import may rely on Node resolution behavior',
    description: 'Flags unresolved relative imports likely to fail under strict resolvers.',
    category: 'resolution',
    defaultSeverity: 'warn',
    confidence: 'medium',
    explanation: 'Non-Node runtimes and bundlers can resolve modules differently.',
    recommendation: 'Use explicit file extensions/paths or configure resolver-compatible exports.'
  },
  run(context) {
    const issues: Issue[] = [];
    const affectedTargets = context.targets.filter((target) => target.id !== 'node').map((target) => target.id);
    let index = 0;

    for (const signal of context.sourceSignals) {
      for (const unresolved of signal.unresolvedImports) {
        issues.push(
          createIssue(
            {
              rule: unresolvedImportRule,
              index: ++index,
              message: `Import "${unresolved.specifier}" could not be resolved with portable extension rules.`,
              affectedTargets,
              sourceType: 'source',
              location: {
                filePath: signal.filePath,
                line: unresolved.line,
                column: unresolved.column
              },
              metadata: {
                specifier: unresolved.specifier
              }
            },
            context.severityOverrides
          )
        );
      }
    }

    return issues;
  }
};
RULES.push(unresolvedImportRule);

const exportsConditionRule: RuleDefinition = {
  meta: {
    id: 'package-exports/node-only-condition',
    title: 'Node-only exports condition',
    description: 'Dependency exposes node-specific exports without worker/browser/default fallback.',
    category: 'package-exports',
    defaultSeverity: 'error',
    confidence: 'medium',
    explanation: 'Conditional exports that only target Node often break edge and WinterTC consumers.',
    recommendation: 'Select dependencies with worker/browser/default condition branches.'
  },
  run(context) {
    const issues: Issue[] = [];
    const affectedTargets = context.targets.filter((target) => target.id !== 'node' && target.id !== 'bun').map((target) => target.id);
    let index = 0;

    for (const pkg of context.packageSignals) {
      if (!pkg.exportsNodeOnly) {
        continue;
      }
      issues.push(
        createIssue(
          {
            rule: exportsConditionRule,
            index: ++index,
            message: `Dependency "${pkg.packageName}" appears to publish node-only export conditions.`,
            affectedTargets,
            sourceType: 'dependency',
            packageName: pkg.packageName,
            location: {
              filePath: path.join(pkg.packagePath, 'package.json'),
              line: 1,
              column: 0
            },
            dependencyBlame: {
              rootProject: 'project',
              chain: ['project', pkg.packageName],
              offendingPackage: pkg.packageName,
              exportPath: pkg.entryFile
            }
          },
          context.severityOverrides
        )
      );
    }

    return issues;
  }
};
RULES.push(exportsConditionRule);

const dependencyBuiltinRule: RuleDefinition = {
  meta: {
    id: 'dependency-portability/transitive-node-runtime',
    title: 'Transitive dependency Node runtime assumption',
    description: 'Highlights transitive dependencies that import Node-only APIs.',
    category: 'dependency-portability',
    defaultSeverity: 'error',
    confidence: 'medium',
    explanation: 'Application code can be clean while dependencies still block edge deployment.',
    recommendation: 'Swap dependency, pin edge-safe version, or route execution to Node runtime.'
  },
  run(context) {
    const issues: Issue[] = [];
    const affectedTargets = context.targets.filter((target) => target.id !== 'node' && target.id !== 'bun').map((target) => target.id);
    let index = 0;

    for (const dep of context.dependencySignals) {
      for (const imp of dep.signal.imports) {
        if (!findBuiltin(imp.specifier)) {
          continue;
        }
        issues.push(
          createIssue(
            {
              rule: dependencyBuiltinRule,
              index: ++index,
              message: `Dependency "${dep.packageName}" imports "${imp.specifier}" and may break edge portability.`,
              affectedTargets,
              sourceType: 'dependency',
              packageName: dep.packageName,
              location: {
                filePath: dep.signal.filePath,
                line: imp.line,
                column: imp.column
              },
              dependencyBlame: {
                rootProject: dep.chain[0] ?? 'project',
                chain: dep.chain,
                offendingPackage: dep.packageName,
                offendingFile: dep.signal.filePath
              }
            },
            context.severityOverrides
          )
        );
      }
    }

    return issues;
  }
};
RULES.push(dependencyBuiltinRule);

const runtimeConditionalRule: RuleDefinition = {
  meta: {
    id: 'runtime-conditional-code/unsafe-runtime-branching',
    title: 'Runtime branching heuristic',
    description: 'Flags runtime checks that may hide target-specific breakage.',
    category: 'runtime-conditional-code',
    defaultSeverity: 'info',
    confidence: 'low',
    explanation: 'Conditional runtime branching can mask portability bugs and dead code assumptions.',
    recommendation: 'Ensure each runtime path is tested and guarded with explicit capability checks.'
  },
  run(context) {
    const issues: Issue[] = [];
    let index = 0;

    for (const signal of context.sourceSignals) {
      for (const check of signal.runtimeChecks) {
        issues.push(
          createIssue(
            {
              rule: runtimeConditionalRule,
              index: ++index,
              message: `Runtime conditional detected: ${check.expression}`,
              affectedTargets: context.targets.map((target) => target.id),
              sourceType: 'source',
              location: {
                filePath: signal.filePath,
                line: check.line,
                column: check.column
              }
            },
            context.severityOverrides
          )
        );
      }
    }

    return issues;
  }
};
RULES.push(runtimeConditionalRule);

export function allRules(): RuleDefinition[] {
  return [...RULES];
}

export function findRule(ruleId: string): RuleDefinition | undefined {
  return RULES.find((rule) => rule.meta.id === ruleId);
}

export function listRuleMeta() {
  return RULES.map((rule) => rule.meta);
}

