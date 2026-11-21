import { createMenuEntry } from '../model/menu.js';
import type { MenuEntry, MenuLine } from '../model/menu.types.js';
import { decodeByteString, encodeByteString, validateField, validateFieldBytes } from './bytes.js';
import { stripCrlf } from './lines.js';
import type { WireCharset } from './options.types.js';

const validateType = (type: string): void => {
  if (!/^[!-~]$/u.test(type)) {
    throw new SyntaxError('Expected a single printable Gopher item type.');
  }
};

const validatePort = (port: number): void => {
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new RangeError('Gopher ports must be integers between 0 and 65535.');
  }
};

export const readEntry = (bytes: Uint8Array, charset: WireCharset): MenuEntry => {
  const line = stripCrlf(bytes);
  const tab = line.indexOf(9);
  if (tab < 1) {
    throw new SyntaxError('Expected a menu heading followed by a tab.');
  }

  const [selector, host, digits] = decodeByteString(line.subarray(tab + 1)).split('\t', 3);

  if (selector === undefined || !host || !digits || !/^\d+$/u.test(digits)) {
    throw new SyntaxError('Expected a menu heading, selector, host and decimal port.');
  }

  const type = decodeByteString(line.subarray(0, 1));
  const labelBytes = line.subarray(1, tab);
  validateFieldBytes(labelBytes);

  const label = charset.decode(labelBytes);
  validateType(type);
  validateField(label);
  validateField(selector);
  validateField(host);

  const port = Number(digits);
  if (port > 65535) {
    throw new SyntaxError('Gopher menu port exceeds 65535.');
  }

  return createMenuEntry(type, label, {
    selector,
    host,
    port,
  });
};

const infoTarget = {
  selector: '',
  host: 'fake',
  port: 0,
};

export const writeEntry = (entry: MenuLine, charset: WireCharset): Uint8Array => {
  validateType(entry.type);
  validateField(entry.label);

  const encodedLabel = charset.encode(entry.label);
  validateFieldBytes(encodedLabel);

  const { selector, host, port } = 'target' in entry ? entry.target : infoTarget;
  validateField(selector);
  validateField(host);
  validatePort(port);

  if (!host) {
    throw new SyntaxError('A Gopher menu entry needs a host.');
  }

  const target = encodeByteString(`\t${selector}\t${host}\t${port}\r\n`);
  return Buffer.concat([Buffer.from(entry.type), encodedLabel, target]);
};
