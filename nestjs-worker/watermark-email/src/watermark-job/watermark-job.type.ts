/**
 * Contrato de ENTRADA (fixado em BACKLOG.md).
 * Formato produzido pela Parte 2 (nestjs-worker/processing) e consumido
 * por esta etapa (Parte 3) para gerar o PDF marcado e enviar por e-mail.
 *
 * IMPORTANTE: este contrato é fixo. Não renomear campos nem mudar o shape
 * sem alinhar antes com quem está implementando a Parte 2.
 */
export interface WatermarkJob {
  order_id: string;
  buyer_full_name: string;
  buyer_cpf: string; // formatado, ex: 123.456.789-00
  buyer_email: string;
  product_ids: string[]; // usados para localizar assets/ebooks/{product_id}.pdf
}
