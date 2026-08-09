/**
 * Contrato de ENTRADA (fixado em BACKLOG.md).
 * Formato publicado pela Parte 1 (cloudflare-worker) na Cloudflare Queue
 * `beatriz-orders`. Não renomear campos sem alinhar com a Parte 1.
 */
export interface QueueMessage {
  order_id: string;
  store_id: string;
  received_at: string; // ISO 8601
}

/**
 * Envelope de uma mensagem "pulled" da Cloudflare Queue via HTTP Pull Consumer.
 * `id` e `lease_id` são necessários para fazer o ack/retry da mensagem
 * depois de processá-la.
 */
export interface PulledMessage<T> {
  id: string;
  lease_id: string;
  body: T;
  metadata?: Record<string, unknown>;
}
