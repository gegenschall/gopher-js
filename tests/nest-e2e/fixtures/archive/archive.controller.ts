import { once } from 'node:events';

import type { Menu } from '@gopher-js/core';
import {
  GopherBinary,
  GopherItem,
  GopherMenu,
  GopherSearch,
  GopherText,
  type RequestContext,
  type SearchContext,
} from '@gopher-js/nest-gopher';
import { info } from '@gopher-js/server';
import {
  Controller,
  Get,
  Inject,
  UseGuards,
  UseInterceptors,
  type CallHandler,
  type ExecutionContext,
} from '@nestjs/common';
import { Ctx, MessagePattern, Payload } from '@nestjs/microservices';
import { map, Observable } from 'rxjs';

import { counter } from '../counter.codec.js';
import { ArchiveService } from './archive.service.js';

@Controller()
export class ArchiveController {
  @Inject(ArchiveService) private readonly archive!: ArchiveService;

  @GopherText('archive:%2F')
  @UseInterceptors({
    intercept: (_context: ExecutionContext, next: CallHandler<string>) =>
      next.handle().pipe(map((value) => value.toUpperCase())),
  })
  about(@Ctx() context: RequestContext) {
    return this.archive.about() + ' ' + context.selector;
  }

  @GopherMenu('')
  home(): Menu {
    return [info('Welcome')];
  }

  @GopherSearch('/find')
  search(
    @Payload('query', { transform: (query: string) => query.trim() }) query: string,
    @Ctx() context: SearchContext,
  ): Menu {
    return [info(query), info(context.query)];
  }

  @GopherItem(counter, '/count')
  count() {
    return 42n;
  }

  @GopherText('/private')
  @UseGuards({ canActivate: () => false })
  privateText() {
    return 'private';
  }

  @GopherBinary('/file')
  async *file(@Ctx() { signal }: RequestContext) {
    const cancelled = once(signal, 'abort');
    try {
      yield Uint8Array.of(0, 255);
      await cancelled;
    } finally {
      this.archive.released.resolve();
    }
  }

  @GopherText('/pending')
  pending() {
    return new Observable<string>(() => {
      this.archive.subscribed.resolve();
      return () => this.archive.unsubscribed.resolve();
    });
  }

  @MessagePattern('/foreign')
  foreign() {
    return 'foreign';
  }

  @Get('/health')
  health() {
    return this.archive.about();
  }
}
