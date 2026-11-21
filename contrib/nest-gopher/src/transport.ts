import type { GopherAddress, ItemCodec } from '@gopher-js/core';
import { createServer, type GopherServer, type GopherServerEvents } from '@gopher-js/server';
import { Server, type CustomTransportStrategy, type MessageHandler } from '@nestjs/microservices';

import { bindRoute, transportId } from './routes.js';
import type { GopherTransportOptions } from './transport.types.js';

export class GopherTransport extends Server<GopherServerEvents> implements CustomTransportStrategy {
  override readonly transportId = transportId;
  private readonly server: GopherServer<ItemCodec>;
  private readonly options: GopherTransportOptions;

  constructor(options: GopherTransportOptions) {
    super();
    this.options = options;
    this.server = createServer(options);
  }

  get address(): GopherAddress | undefined {
    return this.server.address;
  }

  override addHandler(
    pattern: string,
    callback: MessageHandler,
    isEventHandler = false,
    extras?: { [bindRoute]?: (server: GopherServer<ItemCodec>, callback: MessageHandler) => void },
  ): void {
    // Nest also offers unscoped message patterns to every transport in a hybrid app.
    if (!extras?.[bindRoute]) return;
    extras[bindRoute](this.server, callback);
    super.addHandler(pattern, callback, isEventHandler, extras);
  }

  override async listen(ready: (error?: unknown, address?: GopherAddress) => void): Promise<void> {
    let address: GopherAddress;
    try {
      address = await this.server.listen(this.options.listen);
    } catch (error) {
      ready(error);
      return;
    }
    ready(undefined, address);
  }

  override async close(): Promise<void> {
    await this.server.close(this.options.close);
  }

  override unwrap<T = GopherServer<ItemCodec>>(): T {
    return this.server as T;
  }

  override on<Event extends keyof GopherServerEvents>(
    event: Event,
    listener: GopherServerEvents[Event],
  ) {
    return this.server.on(event, listener);
  }
}
