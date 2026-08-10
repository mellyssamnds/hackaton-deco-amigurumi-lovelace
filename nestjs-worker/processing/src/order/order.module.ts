import { Module } from '@nestjs/common';
import { NuvemshopModule } from '../nuvemshop/nuvemshop.module';
import { OrderService } from './order.service';
import {
  HttpWatermarkJobDispatcher,
  WatermarkJobDispatcher,
} from './watermark-job.dispatcher';
import { WebhookController } from './webhook.controller';

@Module({
  imports: [NuvemshopModule],
  controllers: [WebhookController],
  providers: [
    OrderService,
    { provide: WatermarkJobDispatcher, useClass: HttpWatermarkJobDispatcher },
  ],
  exports: [OrderService, WatermarkJobDispatcher],
})
export class OrderModule {}
