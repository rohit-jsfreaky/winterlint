export function flags(): string {
  return `${process.env.NODE_ENV}:${Buffer.from('x').toString('hex')}`;
}
