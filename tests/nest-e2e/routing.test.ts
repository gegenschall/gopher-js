import { test } from './fixtures/app.js';

test('dispatches an opaque selector through DI and an interceptor', async ({
  client,
  signal,
  expect,
}) => {
  expect(await client.text('archive:%2F', { signal })).toBe('ARCHIVE ARCHIVE:%2F\n');
});

test('serves the root menu and encodes a custom item', async ({ client, signal, expect }) => {
  expect((await client.menu('', { signal }))[0]?.label).toBe('Welcome');
  expect(await client.text('/count', { signal })).toBe('42\n');
});

test('pipes transform the search payload and preserve the original context', async ({
  client,
  signal,
  expect,
}) => {
  const lines = await client.search('/find', ' 雪 ', { signal });

  expect(lines.map((line) => line.label)).toEqual(['雪', ' 雪 ']);
});

test('applies route guards and ignores foreign message patterns', async ({
  client,
  signal,
  expect,
}) => {
  expect((await client.menu('/private', { signal }))[0]).toMatchObject({
    kind: 'error',
    label: 'Handler failed',
  });
  expect((await client.menu('/foreign', { signal }))[0]?.label).toBe('Selector not found');
});
