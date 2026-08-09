import { z } from 'zod';

/**
 * Schema do pedido completo retornado pela API da Nuvemshop
 * (GET /v1/{store_id}/orders/{order_id}).
 *
 * Cobrimos apenas os campos que a Parte 2 precisa para montar o WatermarkJob.
 * Qualquer outro campo do payload real da Nuvemshop é ignorado (o Zod, por
 * padrão, não falha em campos extras não declarados no schema).
 *
 * TODO: confirmar campo real de CPF na API da Nuvemshop.
 * Hoje usamos `contact_identification` como placeholder (depende do app de
 * checkout usado na loja - pode vir em `contact_identification`,
 * num campo customizado, ou embutido em `note`). Ver extractBuyerCpf() abaixo.
 */
export const OrderProductSchema = z.object({
  product_id: z.union([z.string(), z.number()]).transform((v) => String(v)),
  name: z.string().optional(),
  quantity: z.number().int().positive().optional(),
});

export const OrderSchema = z.object({
  id: z.union([z.string(), z.number()]).transform((v) => String(v)),
  contact_name: z.string().min(1, 'contact_name vazio'),
  contact_email: z.string().email('contact_email inválido'),
  // TODO: confirmar campo real de CPF - placeholder até validação com o time.
  contact_identification: z.string().min(1).optional().nullable(),
  products: z.array(OrderProductSchema).min(1, 'pedido sem produtos'),
});

export type OrderProduct = z.infer<typeof OrderProductSchema>;
export type Order = z.infer<typeof OrderSchema>;
