import { Module } from '@nestjs/common';
import { OrderModule } from '../order/order.module';
import {
  HttpWatermarkJobDispatcher,
  WatermarkJobDispatcher,
} from '../order/watermark-job.dispatcher';
import { CloudflareQueueClient } from './cloudflare-queue.client';
import { QueueConsumer } from './queue.consumer';

@Module({
  imports: [OrderModule],
  providers: [
    CloudflareQueueClient,
    QueueConsumer,
    // Integração real com a Parte 3 (watermark-email): POST /watermark-jobs
    // no serviço separado (ver docker-compose.yml e .env WATERMARK_EMAIL_URL).
    { provide: WatermarkJobDispatcher, useClass: HttpWatermarkJobDispatcher },
  ],
  exports: [QueueConsumer],
})
export class QueueModule {}
