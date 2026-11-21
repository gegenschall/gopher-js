import type {
  MenuFraming,
  MenuFramingOptions,
  TextFraming,
  TextFramingOptions,
} from './options.types.js';

export const isCustomFraming = <Strategy extends MenuFraming | TextFraming>(
  framing: Strategy | MenuFramingOptions | TextFramingOptions,
): framing is Strategy => {
  const reads = typeof framing.read === 'function';
  const writes = typeof framing.write === 'function';

  if (reads !== writes) {
    throw new TypeError('A custom framing strategy needs both read and write functions.');
  }

  return reads && writes;
};
