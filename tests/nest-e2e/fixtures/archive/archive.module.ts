import { Module } from '@nestjs/common';

import { ArchiveController } from './archive.controller.js';
import { ArchiveService } from './archive.service.js';

@Module({ controllers: [ArchiveController], providers: [ArchiveService] })
// oxlint-disable-next-line typescript/no-extraneous-class -- Nest reads the module decorator.
export class ArchiveModule {}
