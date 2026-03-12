import path from 'node:path';
import { access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { parse } from '@babel/parser';
import traverseImport from '@babel/traverse';
import type * as t from '@babel/types';
import { SourceSignal } from '../types.js';

const KNOWN_GLOBALS = new Set(['process', 'Buffer', 'global', '__dirname', '__filename', 'require', 'module', 'exports']);
const NODE_API_IMPORTS = new Set(['fs', 'child_process', 'net', 'tls', 'dgram', 'cluster', 'worker_threads', 'crypto', 'vm', 'async_hooks', 'readline', 'repl']);
const EXTENSIONS = ['.ts', '.tsx', '.js', '.mjs', '.cjs', '.jsx', '.json'];

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function resolveRelativeImport(baseFile: string, specifier: string): Promise<boolean> {
  const baseDir = path.dirname(baseFile);
  const target = path.resolve(baseDir, specifier);

  if (await exists(target)) {
    return true;
  }

  for (const ext of EXTENSIONS) {
    if (await exists(`${target}${ext}`)) {
      return true;
    }
  }

  for (const ext of EXTENSIONS) {
    if (await exists(path.join(target, `index${ext}`))) {
      return true;
    }
  }

  return false;
}

function loc(node: t.Node): { line: number; column: number } {
  return {
    line: node.loc?.start.line ?? 1,
    column: node.loc?.start.column ?? 0
  };
}

export async function scanSourceFile(filePath: string, content: string): Promise<SourceSignal> {
  const signal: SourceSignal = {
    filePath,
    imports: [],
    globals: [],
    dynamicRequire: [],
    evalLike: [],
    nodeApiCalls: [],
    runtimeChecks: [],
    unresolvedImports: []
  };

  const ast = parse(content, {
    sourceType: 'unambiguous',
    plugins: ['typescript', 'jsx', 'importAttributes', 'dynamicImport']
  });

  const unresolvedChecks: Array<Promise<void>> = [];
  const traverse = ((traverseImport as unknown as { default?: unknown }).default ?? traverseImport) as (astNode: unknown, visitors: Record<string, (pathNode: any) => void>) => void;

  traverse(ast, {
    ImportDeclaration(pathNode: any) {
      const specifier = pathNode.node.source.value;
      const point = loc(pathNode.node);
      signal.imports.push({ specifier, kind: 'import', dynamic: false, line: point.line, column: point.column });

      if (NODE_API_IMPORTS.has(specifier.replace(/^node:/, ''))) {
        signal.nodeApiCalls.push({ api: specifier.replace(/^node:/, ''), line: point.line, column: point.column });
      }

      if (specifier.startsWith('.')) {
        unresolvedChecks.push(
          resolveRelativeImport(filePath, specifier).then((ok) => {
            if (!ok) {
              signal.unresolvedImports.push({ specifier, line: point.line, column: point.column });
            }
          })
        );
      }
    },
    ExportNamedDeclaration(pathNode: any) {
      const specifier = pathNode.node.source?.value;
      if (!specifier) {
        return;
      }
      const point = loc(pathNode.node);
      signal.imports.push({ specifier, kind: 'export', dynamic: false, line: point.line, column: point.column });
      if (specifier.startsWith('.')) {
        unresolvedChecks.push(
          resolveRelativeImport(filePath, specifier).then((ok) => {
            if (!ok) {
              signal.unresolvedImports.push({ specifier, line: point.line, column: point.column });
            }
          })
        );
      }
    },
    ExportAllDeclaration(pathNode: any) {
      const specifier = pathNode.node.source.value;
      const point = loc(pathNode.node);
      signal.imports.push({ specifier, kind: 'export', dynamic: false, line: point.line, column: point.column });
      if (specifier.startsWith('.')) {
        unresolvedChecks.push(
          resolveRelativeImport(filePath, specifier).then((ok) => {
            if (!ok) {
              signal.unresolvedImports.push({ specifier, line: point.line, column: point.column });
            }
          })
        );
      }
    },
    CallExpression(pathNode: any) {
      const callee = pathNode.node.callee;
      const point = loc(pathNode.node);

      if (callee.type === 'Identifier' && callee.name === 'require') {
        const firstArg = pathNode.node.arguments[0];
        if (firstArg && firstArg.type === 'StringLiteral') {
          signal.imports.push({ specifier: firstArg.value, kind: 'require', dynamic: false, line: point.line, column: point.column });
          if (NODE_API_IMPORTS.has(firstArg.value.replace(/^node:/, ''))) {
            signal.nodeApiCalls.push({ api: firstArg.value.replace(/^node:/, ''), line: point.line, column: point.column });
          }
          if (firstArg.value.startsWith('.')) {
            unresolvedChecks.push(
              resolveRelativeImport(filePath, firstArg.value).then((ok) => {
                if (!ok) {
                  signal.unresolvedImports.push({ specifier: firstArg.value, line: point.line, column: point.column });
                }
              })
            );
          }
        } else {
          signal.dynamicRequire.push({ line: point.line, column: point.column });
          signal.imports.push({ specifier: '<dynamic>', kind: 'require', dynamic: true, line: point.line, column: point.column });
        }
      }

      if (callee.type === 'Identifier' && callee.name === 'eval') {
        signal.evalLike.push({ kind: 'eval', line: point.line, column: point.column });
      }

      if (callee.type === 'Import') {
        const firstArg = pathNode.node.arguments[0];
        if (!firstArg || firstArg.type !== 'StringLiteral') {
          signal.dynamicRequire.push({ line: point.line, column: point.column });
          signal.imports.push({ specifier: '<dynamic-import>', kind: 'import', dynamic: true, line: point.line, column: point.column });
        } else {
          signal.imports.push({ specifier: firstArg.value, kind: 'import', dynamic: false, line: point.line, column: point.column });
        }
      }

      if (callee.type === 'MemberExpression' && callee.object.type === 'Identifier' && callee.property.type === 'Identifier') {
        const name = `${callee.object.name}.${callee.property.name}`;
        if (name.startsWith('process.') || name.startsWith('Buffer.')) {
          signal.nodeApiCalls.push({ api: name, line: point.line, column: point.column });
        }
      }
    },
    NewExpression(pathNode: any) {
      const point = loc(pathNode.node);
      if (pathNode.node.callee.type === 'Identifier' && pathNode.node.callee.name === 'Function') {
        signal.evalLike.push({ kind: 'new-function', line: point.line, column: point.column });
      }
    },
    IfStatement(pathNode: any) {
      const point = loc(pathNode.node);
      const test = pathNode.node.test;
      if (test.type === 'BinaryExpression' || test.type === 'LogicalExpression') {
        const snippet = content.slice(test.start ?? 0, test.end ?? 0);
        if (snippet.includes('process') || snippet.includes('Deno') || snippet.includes('Bun')) {
          signal.runtimeChecks.push({ expression: snippet, line: point.line, column: point.column });
        }
      }
    },
    Identifier(pathNode: any) {
      if (!pathNode.isReferencedIdentifier()) {
        return;
      }
      const name = pathNode.node.name;
      if (!KNOWN_GLOBALS.has(name)) {
        return;
      }
      if (pathNode.scope.hasBinding(name)) {
        return;
      }
      const point = loc(pathNode.node);
      signal.globals.push({ name, line: point.line, column: point.column });
    }
  });

  await Promise.all(unresolvedChecks);
  return signal;
}

