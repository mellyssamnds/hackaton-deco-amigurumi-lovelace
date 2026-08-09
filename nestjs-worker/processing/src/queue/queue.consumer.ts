import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CloudflareQueueClient } from './cloudflare-queue.client';
import { QueueMessageSchema } from './queue-message.schema';
import { PulledMessage, QueueMessage } from './queue.types';
import { InvalidBuyerCpfError, InvalidOrderError, OrderService } from '../order/order.service';
import { WatermarkJobDispatcher, WatermarkJobRejectedError } from '../order/watermark-job.dispatcher';

/**
 * HTTP Pull Consumer da Cloudflare Queue `beatriz-orders`.
 *
 * Faz polling a cada CF_QUEUE_POLL_INTERVAL_MS (default 5s), buscando um
 * lote de mensagens por vez. Para cada mensagem:
 *   1. valida o envelope QueueMessage com Zod;
 *   2. busca o pedido completo na Nuvemshop e monta o WatermarkJob;
 *   3. entrega o WatermarkJob (dispatcher - ponto de integração c/ Parte 3);
 *   4. ack em caso de sucesso, retry em caso de falha tratada.
 *
 * Erros inesperados de uma mensagem NUNCA derrubam o loop de polling:
 * são logados e a mensagem individual vai para retry.
 */
@Injectable()
export class QueueConsumer implements OnModuleInit {
  private readonly logger = new Logger(QueueConsumer.name);
  private readonly pollIntervalMs: number;
  private polling = false;
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly queueClient: CloudflareQueueClient,
    private readonly orderService: OrderService,
    private readonly dispatcher: WatermarkJobDispatcher,
    private readonly config: ConfigService,
  ) {
    this.pollIntervalMs = Number(
      this.config.get('CF_QUEUE_POLL_INTERVAL_MS', 5000),
    );
  }

  onModuleInit() {
    this.scheduleNextPoll();
  }

  private scheduleNextPoll() {
    this.timer = setTimeout(() => {
      this.pollOnce()
        .catch((err) =>
          this.logger.error(
            `Erro inesperado no ciclo de polling da fila: ${err}`,
          ),
        )
        .finally(() => this.scheduleNextPoll());
    }, this.pollIntervalMs);
  }

  /** Exposto para testes - roda um único ciclo de pull + processamento. */
  async pollOnce(): Promise<void> {
    if (this.polling) return; // evita sobreposição se um ciclo demorar
    this.polling = true;

    try {
      const messages = await this.queueClient.pull<unknown>();
      if (messages.length === 0) return;

      this.logger.log(`Puxadas ${messages.length} mensagem(ns) da fila`);

      const acked: string[] = [];
      const retried: string[] = [];

      for (const message of messages) {
        const outcome = await this.processMessage(message);
        if (outcome === 'ack') acked.push(message.lease_id);
        else retried.push(message.lease_id);
      }

      await this.queueClient.ack(acked);
      await this.queueClient.retry(retried);
    } catch (err) {
      this.logger.error(`Falha ao puxar/processar lote da fila: ${err}`);
    } finally {
      this.polling = false;
    }
  }

  /**
   * Processa uma mensagem individual. Retorna 'ack' se deve ser removida
   * da fila, ou 'retry' se deve voltar para reprocessamento.
   */
  private async processMessage(
    message: PulledMessage<unknown>,
  ): Promise<'ack' | 'retry'> {
    const parsed = QueueMessageSchema.safeParse(message.body);
    if (!parsed.success) {
      // Mensagem malformada: não adianta reprocessar, ack para não
      // travar a fila e loga para investigação (poderia ir para
      // dead-letter se a fila tiver essa configuração).
      this.logger.error(
        `Mensagem malformada (id=${message.id}) - descartada: ${parsed.error.message}`,
      );
      return 'ack';
    }

    const queueMessage: QueueMessage = parsed.data;

    try {
      const job = await this.orderService.buildWatermarkJob(
        queueMessage.order_id,
        queueMessage.store_id,
      );
      await this.dispatcher.dispatch(job);
      return 'ack';
    } catch (err) {
      if (err instanceof InvalidOrderError || err instanceof InvalidBuyerCpfError) {
        // Erro de dado, não de infraestrutura: reprocessar não vai
        // corrigir o payload da Nuvemshop. Loga e faz ack para não
        // travar a fila; fica registrado para investigação manual.
        this.logger.error(
          `Pedido ${queueMessage.order_id} não pôde ser validado, descartando da fila: ${err.message}`,
        );
        return 'ack';
      }

      if (err instanceof WatermarkJobRejectedError) {
        // Erro de dado do lado da Parte 3 (4xx - payload rejeitado, ex.:
        // e-book inexistente para o product_id). Reprocessar a mesma
        // mensagem não corrige o problema: ack para não retentar
        // indefinidamente, fica registrado para investigação manual.
        this.logger.error(
          `Pedido ${queueMessage.order_id} rejeitado pela Parte 3, descartando da fila: ${err.message}`,
        );
        return 'ack';
      }

      // Falha de infraestrutura (rede, timeout, 5xx da Nuvemshop ou da
      // Parte 3): vale a pena tentar de novo depois.
      this.logger.error(
        `Falha ao processar pedido ${queueMessage.order_id}, será retentado: ${err}`,
      );
      return 'retry';
    }
  }
}
