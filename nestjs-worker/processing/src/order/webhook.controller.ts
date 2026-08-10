import { Controller, Post, Body, Headers, HttpCode, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OrderService } from './order.service';
import { WatermarkJobDispatcher } from './watermark-job.dispatcher';

@Controller('webhook')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  constructor(
    private readonly orderService: OrderService,
    private readonly dispatcher: WatermarkJobDispatcher,
    private readonly config: ConfigService,
  ) {}

  @Post()
  @HttpCode(200)
  async handleNuvemshopWebhook(
    @Body() body: any,
    @Headers('x-nuvemshop-store-id') storeIdHeader?: string,
  ) {
    this.logger.log(`Webhook recebido: ${JSON.stringify(body)}`);

    const orderId = String(body.id);
    const storeId = storeIdHeader || this.config.get<string>('NUVEMSHOP_STORE_ID') || '';

    if (!orderId || orderId === 'undefined') {
      this.logger.warn('Webhook ignorado: ID do pedido não encontrado no payload.');
      return { status: 'ignored', reason: 'missing_id' };
    }

    try {
      this.logger.log(`Iniciando processamento direto do pedido ${orderId} (Store: ${storeId})`);
      const job = await this.orderService.buildWatermarkJob(orderId, storeId);
      await this.dispatcher.dispatch(job);
      return { status: 'success' };
    } catch (err) {
      this.logger.error(`Erro ao processar webhook do pedido ${orderId}: ${err}`);
      // Retorna 200 para a Nuvemshop não ficar retentando em caso de erros de validação
      // (na vida real, trataríamos HTTP codes com mais granularidade)
      return { status: 'error', message: err instanceof Error ? err.message : String(err) };
    }
  }
}
