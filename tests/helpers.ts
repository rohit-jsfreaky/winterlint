import path from 'node:path';

export function fixturePath(name: string): string {
  return path.resolve(process.cwd(), 'tests', 'fixtures', name);
}

export async function captureIO<T>(fn: () => Promise<T>): Promise<{ stdout: string; stderr: string; result: T }> {
  let stdout = '';
  let stderr = '';

  const stdoutWrite = process.stdout.write.bind(process.stdout);
  const stderrWrite = process.stderr.write.bind(process.stderr);

  const stdoutProxy = process.stdout as unknown as { write: (...args: any[]) => boolean };
  const stderrProxy = process.stderr as unknown as { write: (...args: any[]) => boolean };

  stdoutProxy.write = (chunk: string | Uint8Array) => {
    stdout += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8');
    return true;
  };

  stderrProxy.write = (chunk: string | Uint8Array) => {
    stderr += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8');
    return true;
  };

  try {
    const result = await fn();
    return { stdout, stderr, result };
  } finally {
    stdoutProxy.write = stdoutWrite;
    stderrProxy.write = stderrWrite;
  }
}

