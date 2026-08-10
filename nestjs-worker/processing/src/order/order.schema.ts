import { z } from 'zod';

/**
 * Schema do pedido completo retornado pela API da Nuvemshop
 * (GET /v1/{store_id}/orders/{order_id}).
 *
 * Cobrimos apenas os campos que a Parte 2 precisa para montar o WatermarkJob.
 * Qualquer outro campo do payload real da Nuvemshop é ignorado (o Zod, por
 * padrão, não falha em campos extras não declarados no schema).
 *
 * CPF/CNPJ do comprador (Pendência 1 - RESOLVIDA):
 * Confirmado na doc oficial da API (2025-03,
 * https://tiendanube.github.io/api-documentation/resources/order) que o
 * payload de Order traz o documento em dois lugares possíveis:
 *   - `contact_identification` (raiz do Order) - pode vir `null` quando o
 *     checkout da loja não capturou o dado.
 *   - `customer.identification` (objeto Customer aninhado) - mesmo dado,
 *     serve de fallback quando o primeiro vier vazio.
 * extractBuyerCpf() em order.service.ts tenta os dois, nessa ordem.
 * Ainda vale testar com um pedido real da loja para confirmar que o
 * checkout usado de fato popula pelo menos um dos dois campos.
 */
export const OrderProductSchema = z.object({
  product_id: z.union([z.string(), z.number()]).transform((v) => String(v)),
  name: z.string().optional(),
  quantity: z.coerce.number().int().positive().optional(),
});

export const OrderCustomerSchema = z.object({
  identification: z.string().min(1).optional().nullable(),
});

export const OrderSchema = z.object({
  id: z.union([z.string(), z.number()]).transform((v) => String(v)),
  contact_name: z.string().min(1, 'contact_name vazio'),
  contact_email: z.string().email('contact_email inválido'),
  contact_identification: z.string().min(1).optional().nullable(),
  customer: OrderCustomerSchema.optional().nullable(),
  products: z.array(OrderProductSchema).min(1, 'pedido sem produtos'),
});

export type OrderProduct = z.infer<typeof OrderProductSchema>;
export type Order = z.infer<typeof OrderSchema>;