import { expect, test } from 'vitest';

test('the built packages load through their public ESM entry points', async () => {
  const modules = await Promise.all([
    import('@gopher-js/core'),
    import('@gopher-js/client'),
    import('@gopher-js/server'),
  ]);

  for (const namespace of modules) {
    expect(Object.prototype.toString.call(namespace)).toBe('[object Module]');
  }
});
