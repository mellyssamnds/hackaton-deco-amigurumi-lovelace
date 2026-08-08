import { z } from "zod";

/**
 * PLACEHOLDER — confirmar contra a documentação oficial da Nuvemshop antes do primeiro deploy.
 * Formato assumido, baseado no padrão documentado de webhooks Nuvemshop/Tiendanube:
 *   { "store_id": 12345, "event": "order/paid", "id": 67890 }
 * onde "id" é o ID do recurso do evento (aqui, o pedido).
 */
export const nuvemshopWebhookEnvelopeSchema = z.object({
  store_id: z.union([z.string(), z.number()]).transform(String),
  event: z.string(),
  id: z.union([z.string(), z.number()]).transform(String),
});

export type NuvemshopWebhookEnvelope = z.infer<typeof nuvemshopWebhookEnvelopeSchema>;

export const ORDER_PAID_EVENT = "order/paid" as const;
