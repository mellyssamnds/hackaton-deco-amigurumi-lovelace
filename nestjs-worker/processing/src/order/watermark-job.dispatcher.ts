import { Injectable, Logger } from '@nestjs/common';
import { WatermarkJob } from './watermark-job.type';

/**
 * Ponto de integração com a Parte 3 (pdf-watermark-email).
 *
 * A Parte 2 termina seu trabalho ao produzir um WatermarkJob válido; como
 * as duas rodam no mesmo processo NestJS (mesma pasta nestjs-worker/,
 * conforme decidido no projeto), a forma mais simples de "entregar" o job
 * é injeção de dependência: a Parte 3 deve fornecer sua própria
 * implementação deste dispatcher (ex.: chamando WatermarkService +
 * DeliveryService diretamente, ou publicando em uma fila interna).
 *
 * Esta implementação default (log) é só um placeholder para a Parte 2
 * poder ser testada isoladamente enquanto a Parte 3 não está pronta.
 *
 * TODO (integração com a Parte 3): substituir este provider por um que
 * efetivamente aplica a marca d'água e envia o e-mail, ou trocar por um
 * @Injectable() token sobrescrito no AppModule quando a branch da Parte 3
 * for integrada.
 */
export abstract class WatermarkJobDispatcher {
  abstract dispatch(job: WatermarkJob): Promise<void>;
}

@Injectable()
export class LoggingWatermarkJobDispatcher implements WatermarkJobDispatcher {
  private readonly logger = new Logger(LoggingWatermarkJobDispatcher.name);

  async dispatch(job: WatermarkJob): Promise<void> {
    this.logger.log(
      `WatermarkJob pronto para order_id=${job.order_id} ` +
        `(produtos: ${job.product_ids.join(', ')}) - ` +
        'aguardando integração com a Parte 3 (pdf-watermark-email)',
    );
  }
}
