import { RuntimeTarget, RuntimeTargetId } from '../types.js';

const NODE_BUILTINS = [
  'assert',
  'async_hooks',
  'buffer',
  'child_process',
  'cluster',
  'crypto',
  'dgram',
  'dns',
  'events',
  'fs',
  'http',
  'https',
  'module',
  'net',
  'os',
  'path',
  'readline',
  'repl',
  'stream',
  'tls',
  'url',
  'util',
  'vm',
  'worker_threads',
  'zlib'
] as const;

const BASELINE_WEB_ONLY: RuntimeTarget = {
  id: 'wintertc',
  name: 'WinterTC Baseline',
  aliases: ['wintertc-baseline', 'baseline'],
  family: 'baseline',
  notes: 'Minimum common Web API baseline across WinterTC-compatible runtimes.',
  supportsNodeBuiltins: false,
  supportedNodeBuiltins: [],
  supportsFileSystem: false,
  supportsTcpSockets: false,
  supportsChildProcess: false,
  supportsWorkerThreads: true,
  supportsProcessGlobal: false,
  supportsBufferGlobal: false,
  supportsEvalLike: false,
  supportsNativeAddons: false,
  prefersWebCrypto: true
};

export const TARGETS: RuntimeTarget[] = [
  {
    id: 'node',
    name: 'Node.js',
    aliases: ['nodejs'],
    family: 'node-like',
    notes: 'Reference server runtime with full Node core APIs.',
    supportsNodeBuiltins: true,
    supportedNodeBuiltins: [...NODE_BUILTINS],
    supportsFileSystem: true,
    supportsTcpSockets: true,
    supportsChildProcess: true,
    supportsWorkerThreads: true,
    supportsProcessGlobal: true,
    supportsBufferGlobal: true,
    supportsEvalLike: true,
    supportsNativeAddons: true,
    prefersWebCrypto: false
  },
  {
    id: 'bun',
    name: 'Bun',
    aliases: [],
    family: 'node-like',
    notes: 'Node-compatible runtime with broad builtin support and web APIs.',
    supportsNodeBuiltins: true,
    supportedNodeBuiltins: [...NODE_BUILTINS],
    supportsFileSystem: true,
    supportsTcpSockets: true,
    supportsChildProcess: true,
    supportsWorkerThreads: true,
    supportsProcessGlobal: true,
    supportsBufferGlobal: true,
    supportsEvalLike: true,
    supportsNativeAddons: false,
    prefersWebCrypto: false
  },
  {
    id: 'deno',
    name: 'Deno',
    aliases: [],
    family: 'browser-like',
    notes: 'Web-first runtime with optional Node compatibility layer.',
    supportsNodeBuiltins: false,
    supportedNodeBuiltins: [],
    supportsFileSystem: false,
    supportsTcpSockets: false,
    supportsChildProcess: false,
    supportsWorkerThreads: true,
    supportsProcessGlobal: false,
    supportsBufferGlobal: false,
    supportsEvalLike: true,
    supportsNativeAddons: false,
    prefersWebCrypto: true
  },
  {
    id: 'cloudflare-workers',
    name: 'Cloudflare Workers',
    aliases: ['workers', 'cf-workers', 'cloudflare'],
    family: 'edge',
    notes: 'Edge isolate runtime; no Node fs/process sockets, web APIs first.',
    supportsNodeBuiltins: false,
    supportedNodeBuiltins: [],
    supportsFileSystem: false,
    supportsTcpSockets: false,
    supportsChildProcess: false,
    supportsWorkerThreads: false,
    supportsProcessGlobal: false,
    supportsBufferGlobal: false,
    supportsEvalLike: false,
    supportsNativeAddons: false,
    prefersWebCrypto: true
  },
  {
    id: 'vercel-edge',
    name: 'Vercel Edge Runtime',
    aliases: ['edge-runtime', 'vercel'],
    family: 'edge',
    notes: 'Edge runtime similar to web worker model.',
    supportsNodeBuiltins: false,
    supportedNodeBuiltins: [],
    supportsFileSystem: false,
    supportsTcpSockets: false,
    supportsChildProcess: false,
    supportsWorkerThreads: false,
    supportsProcessGlobal: false,
    supportsBufferGlobal: false,
    supportsEvalLike: false,
    supportsNativeAddons: false,
    prefersWebCrypto: true
  },
  BASELINE_WEB_ONLY,
  {
    id: 'winterjs',
    name: 'WinterJS-style Runtime',
    aliases: ['winterjs-style'],
    family: 'baseline',
    notes: 'WinterJS-style profile: baseline plus selected runtime conveniences.',
    supportsNodeBuiltins: false,
    supportedNodeBuiltins: [],
    supportsFileSystem: false,
    supportsTcpSockets: false,
    supportsChildProcess: false,
    supportsWorkerThreads: true,
    supportsProcessGlobal: false,
    supportsBufferGlobal: true,
    supportsEvalLike: false,
    supportsNativeAddons: false,
    prefersWebCrypto: true
  }
];

const MAP = new Map<string, RuntimeTarget>();
for (const target of TARGETS) {
  MAP.set(target.id, target);
  for (const alias of target.aliases) {
    MAP.set(alias, target);
  }
}

export function resolveTarget(input: string): RuntimeTarget | undefined {
  return MAP.get(input);
}

export function resolveTargets(inputs?: string[]): RuntimeTarget[] {
  if (!inputs || inputs.length === 0) {
    return [...TARGETS];
  }

  const selected = new Map<RuntimeTargetId, RuntimeTarget>();
  for (const raw of inputs) {
    const resolved = resolveTarget(raw);
    if (resolved) {
      selected.set(resolved.id, resolved);
    }
  }

  return [...selected.values()];
}

export function listTargets(): RuntimeTarget[] {
  return [...TARGETS];
}

export const NODE_BUILTIN_SET = new Set<string>([...NODE_BUILTINS, ...NODE_BUILTINS.map((name) => `node:${name}`)]);

export const NETWORK_NODE_APIS = new Set(['net', 'tls', 'dgram']);
