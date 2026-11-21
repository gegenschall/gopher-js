import { createClient } from '@gopher-js/client';
import { defineItemType } from '@gopher-js/core';
import { createServer, info, link } from '@gopher-js/server';
import { expect, test } from 'vitest';

const publicAddress = {
  host: 'archive.example',
  port: 7070,
};
const counter = defineItemType({
  type: 'x',
  kind: 'counter',
  framing: 'text',
  decode: (text) => BigInt(text),
  encode: (value) => value.toString(),
});

test('route links preserve opaque selectors and their advertised destinations', () => {
  const server = createServer({
    publicAddress,
    types: [counter],
  });
  const selector = 'archive:Visit count';
  const target = {
    ...publicAddress,
    selector,
  };
  const visits = server.item(counter, selector, () => 42n);

  expect(visits.link('Visits')).toEqual({
    type: 'x',
    label: 'Visits',
    target,
  });
  expect(
    link.item(counter, 'Remote', {
      ...target,
      port: 70,
    }).target.port,
  ).toBe(70);
  expect(info('Archive')).toEqual({
    type: 'i',
    label: 'Archive',
  });
  expect(counter.decode(counter.encode(42n))).toBe(42n);
  expect(() => server.menu(selector, () => [])).toThrow(/route already exists/i);
});

test('registrations are scoped to each instance and reject conflicting codes and kinds', () => {
  const options = {
    host: publicAddress.host,
    types: [counter],
  };
  expect(() => createClient(options)).not.toThrow();
  expect(() => createClient(options)).not.toThrow();

  for (const conflicting of [
    {
      ...counter,
      kind: 'another',
    },
    {
      ...counter,
      type: 'X',
    },
    {
      ...counter,
      type: '1',
    },
    {
      ...counter,
      kind: 'unknown',
    },
    {
      ...counter,
      type: 'xx',
    },
  ]) {
    expect(() =>
      createClient({
        ...options,
        types: [counter, conflicting],
      }),
    ).toThrow(TypeError);
  }

  const server = createServer({
    publicAddress,
    types: [counter],
  });
  expect(() => server.item({ ...counter }, '/counter', () => 0n)).toThrow(/not registered/);
});
