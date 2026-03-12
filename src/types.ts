export type RuntimeTargetId =
  | 'node'
  | 'bun'
  | 'deno'
  | 'cloudflare-workers'
  | 'vercel-edge'
  | 'wintertc'
  | 'winterjs';

export type RuntimeFamily = 'node-like' | 'edge' | 'browser-like' | 'baseline';

export type Severity = 'error' | 'warn' | 'info';

export type Confidence = 'high' | 'medium' | 'low';

export type IssueCategory =
  | 'node-builtins'
  | 'commonjs'
  | 'filesystem'
  | 'networking'
  | 'process-env'
  | 'native-module'
  | 'dynamic-loading'
  | 'eval-security'
  | 'globals'
  | 'package-exports'
  | 'dependency-portability'
  | 'web-crypto-vs-node-crypto'
  | 'streams-and-buffer-assumptions'
  | 'runtime-conditional-code'
  | 'unsupported-polyfill-assumptions'
  | 'resolution';

export interface RuntimeTarget {
  id: RuntimeTargetId;
  name: string;
  aliases: string[];
  family: RuntimeFamily;
  notes: string;
  supportsNodeBuiltins: boolean;
  supportedNodeBuiltins: string[];
  supportsFileSystem: boolean;
  supportsTcpSockets: boolean;
  supportsChildProcess: boolean;
  supportsWorkerThreads: boolean;
  supportsProcessGlobal: boolean;
  supportsBufferGlobal: boolean;
  supportsEvalLike: boolean;
  supportsNativeAddons: boolean;
  prefersWebCrypto: boolean;
}

export interface FileLocation {
  filePath: string;
  line: number;
  column: number;
}

export interface DependencyBlame {
  rootProject: string;
  chain: string[];
  offendingPackage: string;
  offendingFile?: string;
  exportPath?: string;
}

export interface RuleMeta {
  id: string;
  title: string;
  description: string;
  category: IssueCategory;
  defaultSeverity: Severity;
  docsUrl?: string;
  confidence?: Confidence;
  explanation: string;
  recommendation: string;
  applicableTargets?: RuntimeTargetId[];
  autofixHint?: string;
}

export interface RuleMatch {
  ruleId: string;
  message: string;
  location?: FileLocation;
  data?: Record<string, string | number | boolean | string[] | undefined>;
  confidence?: Confidence;
}

export interface Issue {
  id: string;
  ruleId: string;
  ruleTitle: string;
  category: IssueCategory;
  severity: Severity;
  confidence: Confidence;
  message: string;
  explanation: string;
  recommendation: string;
  affectedTargets: RuntimeTargetId[];
  location?: FileLocation;
  sourceType: 'source' | 'dependency' | 'package';
  packageName?: string;
  dependencyBlame?: DependencyBlame;
  metadata?: Record<string, string | number | boolean | string[] | undefined>;
}

export interface SourceSignal {
  filePath: string;
  imports: Array<{ specifier: string; kind: 'import' | 'export' | 'require'; dynamic: boolean; line: number; column: number }>;
  globals: Array<{ name: string; line: number; column: number }>;
  dynamicRequire: Array<{ line: number; column: number }>;
  evalLike: Array<{ kind: 'eval' | 'new-function'; line: number; column: number }>;
  nodeApiCalls: Array<{ api: string; line: number; column: number }>;
  runtimeChecks: Array<{ expression: string; line: number; column: number }>;
  unresolvedImports: Array<{ specifier: string; line: number; column: number }>;
}

export interface PackageSignal {
  packageName: string;
  packagePath: string;
  version: string;
  dependencies: string[];
  entryFile?: string;
  exportsNodeOnly: boolean;
  isCommonJsOnly: boolean;
  hasNativeAddonSignals: boolean;
  issues: string[];
  chain?: string[];
}

export interface AnalysisSummary {
  totalIssues: number;
  bySeverity: Record<Severity, number>;
  byTarget: Record<RuntimeTargetId, number>;
  byCategory: Record<string, number>;
  topOffendingPackages: Array<{ name: string; count: number }>;
  topOffendingFiles: Array<{ path: string; count: number }>;
}

export interface RuntimeMatrix {
  target: RuntimeTargetId;
  pass: boolean;
  issueCount: number;
  errorCount: number;
  warnCount: number;
}

export interface WinterlintConfig {
  targets?: RuntimeTargetId[];
  include?: string[];
  exclude?: string[];
  ignorePatterns?: string[];
  disabledRules?: string[];
  enabledRules?: string[];
  severityOverrides?: Record<string, Severity>;
  packageIgnoreList?: string[];
  allowlist?: Array<{ ruleId: string; path?: string; package?: string }>;
  defaultReportFormat?: 'pretty' | 'json' | 'compact' | 'markdown';
  maxIssues?: number;
  failOnWarning?: boolean;
  runtimeAssumptions?: Record<string, string | boolean>;
}

export interface AnalyzeOptions {
  cwd?: string;
  path: string;
  fileMode?: boolean;
  targets?: RuntimeTargetId[];
  configPath?: string;
  configOverrides?: WinterlintConfig;
  format?: 'pretty' | 'json' | 'compact' | 'markdown';
  quiet?: boolean;
  verbose?: boolean;
  includeDependencies?: boolean;
  include?: string[];
  ignorePatterns?: string[];
  ruleOverrides?: Record<string, Severity | 'off'>;
}

export interface AnalyzerInput {
  rootPath: string;
  filePaths: string[];
  selectedTargets: RuntimeTarget[];
  config: WinterlintConfig;
  includeDependencies: boolean;
  ignoredPackages: Set<string>;
}

export interface AnalysisMetadata {
  analyzedPath: string;
  generatedAt: string;
  version: string;
  targets: RuntimeTargetId[];
  configUsed: WinterlintConfig;
  configPath?: string;
}

export interface AnalysisResult {
  metadata: AnalysisMetadata;
  issues: Issue[];
  summary: AnalysisSummary;
  runtimeMatrix: RuntimeMatrix[];
  dependencyChains: DependencyBlame[];
  packageSignals: PackageSignal[];
}

export interface ReportContext {
  result: AnalysisResult;
  rules: RuleMeta[];
}



