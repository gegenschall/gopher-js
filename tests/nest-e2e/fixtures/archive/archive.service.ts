import { Injectable } from '@nestjs/common';

@Injectable()
export class ArchiveService {
  readonly released = Promise.withResolvers<void>();
  readonly subscribed = Promise.withResolvers<void>();
  readonly unsubscribed = Promise.withResolvers<void>();

  about() {
    return 'archive';
  }
}
