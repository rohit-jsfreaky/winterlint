import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { scanSourceFile } from './fileScanner.js';
import { PackageSignal, SourceSignal, DependencyBlame } from '../types.js';
import { readJsonFile } from '../utils/fs.js';

interface PackageJson {
  name?: string;
  version?: string;
  type?: string;
  main?: string;
  module?: string;
  exports?: unknown;
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
  gypfile?: boolean;
}

export interface DependencyFileSignal {
  packageName: string;
  packagePath: string;
  chain: string[];
  signal: SourceSignal;
}

export interface DependencyAnalysis {
  packageSignals: PackageSignal[];
  fileSignals: DependencyFileSignal[];
  dependencyChains: DependencyBlame[];
  rootProjectName: string;
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function extractDeps(packageJson: PackageJson): string[] {
  return [...Object.keys(packageJson.dependencies ?? {}), ...Object.keys(packageJson.optionalDependencies ?? {})];
}

function pickExportObjectPath(exportsField: unknown): string | undefined {
  if (typeof exportsField === 'string') {
    return exportsField;
  }

  if (!exportsField || typeof exportsField !== 'object') {
    return undefined;
  }

  const exp = exportsField as Record<string, unknown>;
  if (typeof exp['.'] === 'string') {
    return exp['.'];
  }

  if (exp['.'] && typeof exp['.'] === 'object') {
    const entry = exp['.'] as Record<string, unknown>;
    for (const key of ['worker', 'browser', 'import', 'default', 'node', 'require']) {
      const value = entry[key];
      if (typeof value === 'string') {
        return value;
      }
    }
  }

  for (const key of ['worker', 'browser', 'import', 'default', 'node', 'require']) {
    const value = exp[key];
    if (typeof value === 'string') {
      return value;
    }
  }

  return undefined;
}

function exportsNodeOnly(exportsField: unknown): boolean {
  if (!exportsField || typeof exportsField !== 'object') {
    return false;
  }

  const serialized = JSON.stringify(exportsField);
  return serialized.includes('"node"') && !serialized.includes('"browser"') && !serialized.includes('"worker"') && !serialized.includes('"default"');
}

function isCommonJsOnly(packageJson: PackageJson): boolean {
  if (packageJson.type === 'module') {
    return false;
  }
  if (packageJson.module) {
    return false;
  }

  const exportsField = packageJson.exports;
  if (exportsField && typeof exportsField === 'object') {
    const serialized = JSON.stringify(exportsField);
    if (serialized.includes('"import"')) {
      return false;
    }
  }

  return true;
}

function hasNativeAddonSignals(packageJson: PackageJson): boolean {
  if (packageJson.gypfile) {
    return true;
  }
  const scripts = packageJson.scripts ?? {};
  const install = scripts.install ?? '';
  const preinstall = scripts.preinstall ?? '';
  return /node-gyp|prebuild|\.node/.test(`${install} ${preinstall}`);
}

async function resolvePackagePath(depName: string, fromPackagePath: string, rootPath: string): Promise<string | undefined> {
  const candidate = path.join(fromPackagePath, 'node_modules', depName);
  if (await exists(candidate)) {
    return candidate;
  }

  const rootCandidate = path.join(rootPath, 'node_modules', depName);
  if (await exists(rootCandidate)) {
    return rootCandidate;
  }

  return undefined;
}

async function analyzeDependencyEntry(packageName: string, packagePath: string, packageJson: PackageJson): Promise<SourceSignal | undefined> {
  const rawEntry = pickExportObjectPath(packageJson.exports) ?? packageJson.module ?? packageJson.main;
  if (!rawEntry) {
    return undefined;
  }
  const normalized = rawEntry.startsWith('./') ? rawEntry.slice(2) : rawEntry;
  const entryFile = path.join(packagePath, normalized);
  if (!(await exists(entryFile))) {
    return undefined;
  }

  const content = await readFile(entryFile, 'utf8');
  return scanSourceFile(entryFile, content);
}

export async function analyzeDependencies(rootPath: string, ignorePackages: Set<string>): Promise<DependencyAnalysis> {
  const rootPackagePath = path.join(rootPath, 'package.json');
  const rootPackageJson = (await readJsonFile<PackageJson>(rootPackagePath)) ?? {};
  const rootProjectName = rootPackageJson.name ?? path.basename(rootPath);

  const packageSignals: PackageSignal[] = [];
  const fileSignals: DependencyFileSignal[] = [];
  const dependencyChains: DependencyBlame[] = [];
  const visited = new Set<string>();

  const rootDependencies = extractDeps(rootPackageJson);

  const walk = async (depName: string, parentPackagePath: string, chain: string[]): Promise<void> => {
    if (ignorePackages.has(depName)) {
      return;
    }

    const depPackagePath = await resolvePackagePath(depName, parentPackagePath, rootPath);
    if (!depPackagePath) {
      return;
    }

    const packageJsonPath = path.join(depPackagePath, 'package.json');
    if (!(await exists(packageJsonPath))) {
      return;
    }

    const dedupeKey = `${depName}@${depPackagePath}`;
    if (visited.has(dedupeKey)) {
      return;
    }
    visited.add(dedupeKey);

    const packageJson = await readJsonFile<PackageJson>(packageJsonPath);
    const packageName = packageJson.name ?? depName;
    const currentChain = [...chain, packageName];
    const deps = extractDeps(packageJson);

    const signal: PackageSignal = {
      packageName,
      packagePath: depPackagePath,
      version: packageJson.version ?? '0.0.0',
      dependencies: deps,
      entryFile: pickExportObjectPath(packageJson.exports) ?? packageJson.module ?? packageJson.main,
      exportsNodeOnly: exportsNodeOnly(packageJson.exports),
      isCommonJsOnly: isCommonJsOnly(packageJson),
      hasNativeAddonSignals: hasNativeAddonSignals(packageJson),
      issues: []
    };

    if (signal.exportsNodeOnly) {
      signal.issues.push('node-only-exports');
    }
    if (signal.isCommonJsOnly) {
      signal.issues.push('cjs-only');
    }
    if (signal.hasNativeAddonSignals) {
      signal.issues.push('native-addon');
    }

    packageSignals.push(signal);

    const entrySignal = await analyzeDependencyEntry(packageName, depPackagePath, packageJson);
    if (entrySignal) {
      fileSignals.push({
        packageName,
        packagePath: depPackagePath,
        chain: currentChain,
        signal: entrySignal
      });
    }

    dependencyChains.push({
      rootProject: rootProjectName,
      chain: [rootProjectName, ...currentChain],
      offendingPackage: packageName,
      offendingFile: entrySignal?.filePath,
      exportPath: signal.entryFile
    });

    for (const nextDep of deps) {
      await walk(nextDep, depPackagePath, currentChain);
    }
  };

  for (const depName of rootDependencies) {
    await walk(depName, rootPath, []);
  }

  return {
    packageSignals,
    fileSignals,
    dependencyChains,
    rootProjectName
  };
}
