import { nuvemshopWebhookEnvelopeSchema, ORDER_PAID_EVENT } from "./order-envelope.schema";
import { verifyHmacSignature } from "./hmac";
import type { Env, QueueMessage } from "./types";

const WEBHOOK_PATH = "/webhooks/nuvemshop";

function jsonError(status: number, error: string, details?: unknown): Response {
  return new Response(JSON.stringify({ error, details }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname !== WEBHOOK_PATH) {
      return new Response("Not found", { status: 404 });
    }
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405, headers: { allow: "POST" } });
    }

    const rawBody = await request.text();

    const signatureHeaderValue = request.headers.get(env.WEBHOOK_SIGNATURE_HEADER);
    const hasValidSignature = await verifyHmacSignature(
      rawBody,
      signatureHeaderValue,
      env.WEBHOOK_SIGNING_SECRET,
    );
    if (!hasValidSignature) {
      return jsonError(401, "invalid_signature");
    }

    let parsedBody: unknown;
    try {
      parsedBody = JSON.parse(rawBody);
    } catch {
      return jsonError(400, "malformed_json");
    }

    const envelopeResult = nuvemshopWebhookEnvelopeSchema.safeParse(parsedBody);
    if (!envelopeResult.success) {
      return jsonError(400, "invalid_payload", envelopeResult.error.flatten());
    }
    const envelope = envelopeResult.data;

    if (envelope.event !== ORDER_PAID_EVENT) {
      // Evento fora do escopo deste endpoint: confirmamos o recebimento sem publicar,
      // para a Nuvemshop não reentregar o mesmo webhook.
      return new Response(null, { status: 200 });
    }

    const idempotencyKey = `order:${envelope.store_id}:${envelope.id}`;

    let alreadyProcessedAt: string | null;
    try {
      alreadyProcessedAt = await env.IDEMPOTENCY_KV.get(idempotencyKey);
    } catch {
      return jsonError(502, "idempotency_check_failed");
    }

    if (alreadyProcessedAt !== null) {
      return new Response(null, { status: 200 });
    }

    const message: QueueMessage = {
      order_id: envelope.id,
      store_id: envelope.store_id,
      received_at: new Date().toISOString(),
    };

    try {
      await env.ORDERS_QUEUE.send(message);
    } catch {
      return jsonError(502, "queue_publish_failed");
    }

    // A chave de idempotência só é gravada após a publicação bem-sucedida na fila:
    // preferimos o risco raro de uma duplicata na fila (o consumidor deve ser
    // idempotente) a perder silenciosamente um pedido pago.
    try {
      const ttlSeconds = Number.parseInt(env.IDEMPOTENCY_TTL_SECONDS, 10);
      await env.IDEMPOTENCY_KV.put(idempotencyKey, message.received_at, {
        expirationTtl: ttlSeconds,
      });
    } catch (error) {
      console.error("idempotency_write_failed", error);
    }

    return new Response(null, { status: 200 });
  },
} satisfies ExportedHandler<Env>;
