import { z } from 'zod';

/**
 * Valida o envelope QueueMessage (contrato fixado com a Parte 1) antes de
 * processar. Mensagem malformada é logada e descartada/dead-letter,
 * não derruba o consumidor.
 */
export const QueueMessageSchema = z.object({
  order_id: z.string().min(1),
  store_id: z.string().min(1),
  received_at: z.string().min(1),
});
