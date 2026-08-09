import { Module } from '@nestjs/common';
import { EbookAssetModule } from '../ebook/ebook-asset.module';
import { WatermarkModule } from '../watermark/watermark.module';
import { DeliveryModule } from '../delivery/delivery.module';
import { WatermarkJobsController } from './watermark-jobs.controller';
import { WatermarkOrchestratorService } from './watermark-orchestrator.service';

@Module({
  imports: [EbookAssetModule, WatermarkModule, DeliveryModule],
  controllers: [WatermarkJobsController],
  providers: [WatermarkOrchestratorService],
  exports: [WatermarkOrchestratorService],
})
export class WatermarkJobModule {}
