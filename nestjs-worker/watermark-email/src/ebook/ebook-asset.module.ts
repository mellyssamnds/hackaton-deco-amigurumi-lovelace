import { Module } from '@nestjs/common';
import { EbookAssetSource, LocalFileEbookAssetSource } from './ebook-asset.service';

@Module({
  providers: [{ provide: EbookAssetSource, useClass: LocalFileEbookAssetSource }],
  exports: [EbookAssetSource],
})
export class EbookAssetModule {}
