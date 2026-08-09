import { Module } from '@nestjs/common';
import { NuvemshopClient } from './nuvemshop.client';

@Module({
  providers: [NuvemshopClient],
  exports: [NuvemshopClient],
})
export class NuvemshopModule {}
