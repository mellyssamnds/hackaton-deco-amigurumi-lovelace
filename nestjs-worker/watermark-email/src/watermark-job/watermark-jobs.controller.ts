import {
  BadGatewayException,
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Logger,
  Post,
  UnprocessableEntityException,
} from '@nestjs/common';
import { EbookNotFoundError } from '../ebook/ebook-asset.service';
import { EmailDeliveryError } from '../delivery/delivery.service';
import { WatermarkJobSchema } from './watermark-job.schema';
import { WatermarkOrchestratorService } from './watermark-orchestrator.service';

/**
 * Ponto de entrada desta etapa: recebe o WatermarkJob produzido pela Parte 2
 * (nestjs-worker/processing) e dispara marca d'água + envio por e-mail.
 *
 * Decisão de integração (ver README): as duas etapas rodam como serviços
 * Docker separados na mesma VM, então a entrega do job acontece via HTTP
 * em vez de injeção de dependência no mesmo processo. Fica registrado aqui
 * para confirmar com o time antes de produção.
 */
@Controller('watermark-jobs')
export class WatermarkJobsController {
  private readonly logger = new Logger(WatermarkJobsController.name);

  constructor(private readonly orchestrator: WatermarkOrchestratorService) {}

  @Post()
  @HttpCode(202)
  async receive(@Body() body: unknown): Promise<{ status: string; order_id: string }> {
    const parsed = WatermarkJobSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues);
    }

    const job = parsed.data;

    try {
      await this.orchestrator.process(job);
      return { status: 'sent', order_id: job.order_id };
    } catch (err) {
      if (err instanceof EbookNotFoundError) {
        this.logger.error(`Pedido ${job.order_id}: ${err.message}`);
        throw new UnprocessableEntityException(err.message);
      }

      if (err instanceof EmailDeliveryError) {
        this.logger.error(`Pedido ${job.order_id}: ${err.message}`);
        throw new BadGatewayException(err.message);
      }

      throw err;
    }
  }
}
