import { NODE_BUILTIN_SET } from '../targets/index.js';

type RuleContext = {
  report: (arg: { node: unknown; message: string }) => void;
};

type RuleNode = {
  type: string;
  source?: { value?: string };
  callee?: { type?: string; name?: string };
  name?: string;
};

const noNodeBuiltinImports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow Node builtin imports in portable code'
    },
    schema: []
  },
  create(context: RuleContext) {
    return {
      ImportDeclaration(node: RuleNode) {
        const specifier = node.source?.value;
        if (!specifier || typeof specifier !== 'string') {
          return;
        }
        const normalized = specifier.replace(/^node:/, '');
        if (NODE_BUILTIN_SET.has(specifier) || NODE_BUILTIN_SET.has(normalized)) {
          context.report({
            node,
            message: `Node builtin import "${specifier}" reduces runtime portability.`
          });
        }
      }
    };
  }
};

const noProcessGlobal = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Warn on unguarded process global usage'
    },
    schema: []
  },
  create(context: RuleContext) {
    return {
      Identifier(node: RuleNode) {
        if (node.name === 'process') {
          context.report({
            node,
            message: 'process global is not available in many edge and WinterTC runtimes.'
          });
        }
      }
    };
  }
};

export const rules = {
  'no-node-builtin-imports': noNodeBuiltinImports,
  'no-process-global': noProcessGlobal
};

const plugin = {
  rules,
  configs: {
    recommended: {
      plugins: ['winterlint'],
      rules: {
        'winterlint/no-node-builtin-imports': 'error',
        'winterlint/no-process-global': 'warn'
      }
    }
  }
};

export default plugin;
