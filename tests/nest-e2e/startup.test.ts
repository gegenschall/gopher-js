import { createTransport, test } from './fixtures/app.js';
import { DuplicateRoutesModule } from './fixtures/duplicate-routes.module.js';

test('rejects custom routes whose codec is missing from the transport', async ({
  createApp,
  expect,
}) => {
  const strategy = createTransport({ types: [] });
  const app = await createApp(strategy);

  await expect(app.listen()).rejects.toThrow('The item type "counter" is not registered');
  expect(strategy.address).toBeUndefined();
});

test('rejects duplicate selectors', async ({ createApp, expect }) => {
  const app = await createApp(createTransport(), DuplicateRoutesModule);

  await expect(app.listen()).rejects.toThrow(/already exists/);
});
