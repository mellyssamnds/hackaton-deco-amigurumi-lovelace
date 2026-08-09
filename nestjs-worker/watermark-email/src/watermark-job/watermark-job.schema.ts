import { z } from 'zod';

/**
 * Validação do WatermarkJob recebido (via HTTP, nesta etapa - ver README
 * para a decisão de integração). CPF já deve chegar formatado pela Parte 2
 * (123.456.789-00); validamos o formato aqui de novo porque esta etapa
 * "não confia" no que vem pela rede, mesmo vindo de outra parte do time.
 */
export const WatermarkJobSchema = z.object({
  order_id: z.string().min(1),
  buyer_full_name: z.string().min(1),
  buyer_cpf: z.string().regex(/^\d{3}\.\d{3}\.\d{3}-\d{2}$/, 'CPF fora do formato 123.456.789-00'),
  buyer_email: z.string().email(),
  product_ids: z.array(z.string().min(1)).min(1, 'job sem produtos'),
});

export type ValidatedWatermarkJob = z.infer<typeof WatermarkJobSchema>;
