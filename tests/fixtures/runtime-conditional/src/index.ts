export const runtime = (() => {
  if (typeof process !== 'undefined' && process.release?.name === 'node') {
    return 'node';
  }
  return 'web';
})();
