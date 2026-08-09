import { Module } from '@nestjs/common';
import { OrderModule } from '../order/order.module';
import {
  LoggingWatermarkJobDispatcher,
  WatermarkJobDispatcher,
} from '../order/watermark-job.dispatcher';
import { CloudflareQueueClient } from './cloudflare-queue.client';
import { QueueConsumer } from './queue.consumer';

@Module({
  imports: [OrderModule],
  providers: [
    CloudflareQueueClient,
    QueueConsumer,
    // TODO: quando a Parte 3 for integrada, sobrescrever este provider
    // com a implementação real (WatermarkService + DeliveryService).
    { provide: WatermarkJobDispatcher, useClass: LoggingWatermarkJobDispatcher },
  ],
  exports: [QueueConsumer],
})
export class QueueModule {}
