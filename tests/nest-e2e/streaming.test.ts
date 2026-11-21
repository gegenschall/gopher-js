import { test } from './fixtures/app.js';
import { ArchiveService } from './fixtures/archive/archive.service.js';

test('delivers the first binary bytes before EOF and releases the producer on disconnect', async ({
  running,
  signal,
  expect,
}) => {
  const archive = running.app.get(ArchiveService);

  for await (const chunk of running.client.binary('/file', { signal })) {
    expect(chunk).toEqual(Buffer.from([0, 255]));
    break;
  }
  await archive.released.promise;
});

test('unsubscribes a pending Observable when the Nest app closes', async ({
  running,
  signal,
  expect,
}) => {
  const archive = running.app.get(ArchiveService);

  const lost = expect(running.client.text('/pending', { signal })).rejects.toThrow();
  await archive.subscribed.promise;
  await running.app.close();
  await Promise.all([lost, archive.unsubscribed.promise]);
  expect(running.strategy.address).toBeUndefined();
});
