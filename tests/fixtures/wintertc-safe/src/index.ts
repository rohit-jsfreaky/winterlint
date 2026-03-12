export async function digest(input: Uint8Array): Promise<ArrayBuffer> {
  return crypto.subtle.digest('SHA-256', structuredClone(input));
}
