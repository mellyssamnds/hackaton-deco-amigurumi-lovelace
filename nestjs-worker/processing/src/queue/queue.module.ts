import { Module } from '@nestjs/common';
import { OrderModule } from '../order/order.module';
import { CloudflareQueueClient } from './cloudflare-queue.client';
import { QueueConsumer } from './queue.consumer';

@Module({
  imports: [OrderModule],
  providers: [
    CloudflareQueueClient,
    QueueConsumer,
  ],
  exports: [QueueConsumer],
})
export class QueueModule {}
