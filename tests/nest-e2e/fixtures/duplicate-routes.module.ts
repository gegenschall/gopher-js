import { GopherBinary, GopherText } from '@gopher-js/nest-gopher';
import { Controller, Module } from '@nestjs/common';

@Controller()
class Duplicate {
  @GopherText('') first() {
    return 'first';
  }

  @GopherBinary('') second() {
    return Uint8Array.of(1);
  }
}

@Module({ controllers: [Duplicate] })
// oxlint-disable-next-line typescript/no-extraneous-class -- Nest reads the module decorator.
export class DuplicateRoutesModule {}
