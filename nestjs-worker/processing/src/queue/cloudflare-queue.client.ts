import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import { PulledMessage } from './queue.types';

/**
 * Client HTTP Pull Consumer para Cloudflare Queues.
 * Ver: https://developers.cloudflare.com/queues/reference/pull-consumers/
 *
 * A VM não roda no runtime dos Workers, então o consumo é feito via REST:
 * pull (puxa um lote de mensagens), ack (confirma sucesso) e retry
 * (devolve a mensagem para a fila em caso de falha).
 */
@Injectable()
export class CloudflareQueueClient {
  private readonly logger = new Logger(CloudflareQueueClient.name);
  private readonly http: AxiosInstance;
  private readonly batchSize: number;
  private readonly visibilityTimeoutMs: number;

  constructor(private readonly config: ConfigService) {
    const accountId = this.config.get<string>('CF_ACCOUNT_ID', '');
    const queueId = this.config.get<string>('CF_QUEUE_ID', '');
    const apiToken = this.config.get<string>('CF_API_TOKEN', '');
    this.batchSize = Number(this.config.get('CF_QUEUE_BATCH_SIZE', 10));
    this.visibilityTimeoutMs = Number(
      this.config.get('CF_QUEUE_VISIBILITY_TIMEOUT_MS', 30_000),
    );

    this.http = axios.create({
      baseURL: `https://api.cloudflare.com/client/v4/accounts/${accountId}/queues/${queueId}`,
      timeout: 10_000,
      headers: {
        Authorization: `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * Puxa até `batchSize` mensagens da fila. Mensagens puxadas ficam
   * invisíveis para outros consumidores até `visibilityTimeoutMs` ou até
   * serem confirmadas (ack) / devolvidas (retry).
   */
  async pull<T>(): Promise<PulledMessage<T>[]> {
    const { data } = await this.http.post('/messages/pull', {
      batch_size: this.batchSize,
      visibility_timeout_ms: this.visibilityTimeoutMs,
    });

    return (data?.result?.messages ?? []) as PulledMessage<T>[];
  }

  /** Confirma o processamento com sucesso das mensagens (remove da fila). */
  async ack(leaseIds: string[]): Promise<void> {
    if (leaseIds.length === 0) return;
    await this.http.post('/messages/ack', {
      acks: leaseIds.map((lease_id) => ({ lease_id })),
    });
  }

  /**
   * Devolve as mensagens para a fila para reprocessamento (falha ao
   * buscar/validar o pedido, por exemplo).
   */
  async retry(leaseIds: string[]): Promise<void> {
    if (leaseIds.length === 0) return;
    await this.http.post('/messages/ack', {
      retries: leaseIds.map((lease_id) => ({ lease_id })),
    });
  }
}
