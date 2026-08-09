import { Module } from '@nestjs/common';
import { NuvemshopModule } from '../nuvemshop/nuvemshop.module';
import { OrderService } from './order.service';

@Module({
  imports: [NuvemshopModule],
  providers: [OrderService],
  exports: [OrderService],
})
export class OrderModule {}
