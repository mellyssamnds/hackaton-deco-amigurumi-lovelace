export interface Env {
  readonly ORDERS_QUEUE: Queue<QueueMessage>;
  readonly IDEMPOTENCY_KV: KVNamespace;
  readonly WEBHOOK_SIGNATURE_HEADER: string;
  readonly IDEMPOTENCY_TTL_SECONDS: string;
  readonly WEBHOOK_SIGNING_SECRET: string;
}

/**
 * Contrato fixo com os próximos serviços (nestjs-worker/processing).
 * Qualquer mudança de formato precisa ser combinada com o time antes de alterar.
 */
export interface QueueMessage {
  readonly order_id: string;
  readonly store_id: string;
  readonly received_at: string; // ISO 8601
}
