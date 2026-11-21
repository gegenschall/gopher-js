import { NestFactory } from '@nestjs/core';

import { connect, createTransport, loopback, test } from './fixtures/app.js';
import { ArchiveModule } from './fixtures/archive/archive.module.js';

test('serves HTTP and Gopher on separate ports in a hybrid app', async ({
  track,
  signal,
  expect,
}) => {
  const app = track(
    await NestFactory.create(ArchiveModule, { logger: false, abortOnError: false }),
  );
  const strategy = createTransport();
  app.connectMicroservice({ strategy });
  await app.startAllMicroservices();
  await app.listen(0, loopback.host);

  const response = await fetch((await app.getUrl()) + '/health', { signal });
  expect(await response.text()).toBe('archive');
  expect((await connect(strategy).menu('', { signal }))[0]?.label).toBe('Welcome');
});
