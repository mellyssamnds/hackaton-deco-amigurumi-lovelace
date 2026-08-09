import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import { WatermarkJob } from './watermark-job.type';

/**
 * Ponto de integração com a Parte 3 (watermark-email).
 *
 * A Parte 2 termina seu trabalho ao produzir um WatermarkJob válido e o
 * entrega para quem estiver implementando este contrato.
 */
export abstract class WatermarkJobDispatcher {
  abstract dispatch(job: WatermarkJob): Promise<void>;
}

/**
 * Implementação de log, usada apenas em testes/dev enquanto a Parte 3 não
 * está disponível. Não é o provider default em produção (ver QueueModule).
 */
@Injectable()
export class LoggingWatermarkJobDispatcher implements WatermarkJobDispatcher {
  private readonly logger = new Logger(LoggingWatermarkJobDispatcher.name);

  async dispatch(job: WatermarkJob): Promise<void> {
    this.logger.log(
      `WatermarkJob pronto para order_id=${job.order_id} ` +
        `(produtos: ${job.product_ids.join(', ')}) - ` +
        'aguardando integração com a Parte 3 (watermark-email)',
    );
  }
}

/**
 * Erro específico para falha ao entregar o job à Parte 3 - permite ao
 * QueueConsumer diferenciar (se necessário) de outros erros de
 * infraestrutura. Hoje é tratado como qualquer outro erro não-validação:
 * mensagem volta para retry na fila (ver QueueConsumer.processMessage).
 */
export class WatermarkDispatchError extends Error {}
export class NonRetriableWatermarkDispatchError extends WatermarkDispatchError {}

/**
 * Implementação real de integração com a Parte 3 (watermark-email).
 *
 * Os dois serviços rodam como containers Docker separados na mesma VM
 * (ver docker-compose.yml compartilhado), então a entrega do job acontece
 * via HTTP: POST {WATERMARK_EMAIL_URL}/watermark-jobs, contrato já
 * validado do lado da Parte 3 por WatermarkJobSchema.
 *
 * Resiliência: mesmo padrão do NuvemshopClient - retry com backoff
 * exponencial em erros de rede/5xx; erros 4xx (payload rejeitado pela
 * Parte 3) não são retentados, pois tentar de novo não resolve.
 */
@Injectable()
export class HttpWatermarkJobDispatcher implements WatermarkJobDispatcher {
  private readonly logger = new Logger(HttpWatermarkJobDispatcher.name);
  private readonly http: AxiosInstance;
  private readonly maxRetries: number;
  private readonly baseDelayMs: number;

  constructor(private readonly config: ConfigService) {
    const baseURL = this.config.get<string>(
      'WATERMARK_EMAIL_URL',
      'http://watermark-email:3001',
    );
    this.maxRetries = Number(this.config.get('WATERMARK_DISPATCH_MAX_RETRIES', 3));
    this.baseDelayMs = Number(
      this.config.get('WATERMARK_DISPATCH_RETRY_BASE_DELAY_MS', 500),
    );

    this.http = axios.create({
      baseURL,
      timeout: 15_000,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  async dispatch(job: WatermarkJob): Promise<void> {
    let lastError: unknown;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        await this.http.post('/watermark-jobs', job);
        this.logger.log(
          `WatermarkJob entregue para order_id=${job.order_id} ` +
            `(produtos: ${job.product_ids.join(', ')})`,
        );
        return;
      } catch (err) {
        lastError = err;
        const status = axios.isAxiosError(err) ? err.response?.status : undefined;
        const isClientError = status !== undefined && status >= 400 && status < 500;

        if (isClientError) {
          this.logger.error(
            `Parte 3 rejeitou o WatermarkJob do pedido ${job.order_id} ` +
              `(status ${status}) - não retentável`,
          );
          throw new NonRetriableWatermarkDispatchError(
            `watermark-email respondeu ${status} para o pedido ${job.order_id}`,
          );
        }

        if (attempt < this.maxRetries) {
          const delay = this.baseDelayMs * 2 ** attempt;
          this.logger.warn(
            `Falha ao entregar WatermarkJob do pedido ${job.order_id} ` +
              `(tentativa ${attempt + 1}/${this.maxRetries + 1}). Retentando em ${delay}ms.`,
          );
          await this.sleep(delay);
        }
      }
    }

    this.logger.error(
      `Todas as tentativas de entregar o WatermarkJob do pedido ${job.order_id} falharam`,
    );
    throw new WatermarkDispatchError(
      `Falha ao entregar WatermarkJob do pedido ${job.order_id}: ${this.getErrorMessage(lastError)}`,
    );
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private getErrorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    if (typeof error === 'string') return error;
    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }
}
