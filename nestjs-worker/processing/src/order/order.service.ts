import { Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import { NuvemshopClient } from '../nuvemshop/nuvemshop.client';
import { Order, OrderSchema } from './order.schema';
import { WatermarkJob } from './watermark-job.type';

/**
 * Erro tratado de domínio: pedido buscado na Nuvemshop não passou na
 * validação Zod (payload mudou, campo obrigatório ausente, etc.).
 * O QueueConsumer usa isso para decidir se faz skip/dead-letter em vez
 * de derrubar o processo.
 */
export class InvalidOrderError extends Error {
  constructor(orderId: string, cause: z.ZodError) {
    super(
      `Pedido ${orderId} inválido: ${cause.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ')}`,
    );
    this.name = 'InvalidOrderError';
  }
}

/**
 * Erro tratado específico: o pedido passou na validação Zod do envelope,
 * mas o CPF do comprador está ausente ou não bate com o formato esperado.
 * Como o CPF é obrigatório na marca d'água (Parte 3), preferimos falhar
 * de forma explícita aqui a gerar um WatermarkJob incompleto.
 */
export class InvalidBuyerCpfError extends Error {
  constructor(orderId: string, reason: string) {
    super(`CPF inválido/ausente no pedido ${orderId}: ${reason}`);
    this.name = 'InvalidBuyerCpfError';
  }
}

@Injectable()
export class OrderService {
  private readonly logger = new Logger(OrderService.name);

  constructor(private readonly nuvemshopClient: NuvemshopClient) {}

  /**
   * Busca o pedido completo na Nuvemshop, valida com Zod e monta o
   * WatermarkJob esperado pela Parte 3. Lança InvalidOrderError se o
   * pedido não puder ser validado (erro tratado, não derruba o consumidor).
   */
  async buildWatermarkJob(
    orderId: string,
    storeId?: string,
  ): Promise<WatermarkJob> {
    const rawOrder = await this.nuvemshopClient.fetchOrder(orderId, storeId);

    const parsed = OrderSchema.safeParse(rawOrder);
    if (!parsed.success) {
      this.logger.warn(
        `Falha de validação do pedido ${orderId}: ${parsed.error.message}`,
      );
      throw new InvalidOrderError(orderId, parsed.error);
    }

    return this.toWatermarkJob(parsed.data);
  }

  private toWatermarkJob(order: Order): WatermarkJob {
    return {
      order_id: order.id,
      buyer_full_name: order.contact_name,
      buyer_cpf: this.extractBuyerCpf(order),
      buyer_email: order.contact_email,
      product_ids: order.products.map((p) => p.product_id),
    };
  }

  /**
   * Extração do CPF isolada de propósito.
   *
   * TODO: confirmar com o time o campo real de CPF na API da Nuvemshop.
   * Hoje usamos `contact_identification` como placeholder. Se o campo real
   * for outro (ex.: um campo customizado do checkout, ou vier dentro de
   * `note`/metadata), a mudança fica contida aqui - o resto do serviço
   * (e o contrato WatermarkJob) não muda.
   *
   * Também aplica uma formatação defensiva: se o valor vier só com dígitos
   * (ex. "12345678900"), formata como CPF (123.456.789-00). Se já vier
   * formatado, mantém como está.
   */
  private extractBuyerCpf(order: Order): string {
    const raw = order.contact_identification?.trim();

    if (!raw) {
      this.logger.warn(
        `Pedido ${order.id} sem CPF em contact_identification (placeholder). ` +
          'Confirmar campo real com o time antes de ir para produção.',
      );
      throw new InvalidBuyerCpfError(order.id, 'campo ausente/vazio');
    }

    const digitsOnly = raw.replace(/\D/g, '');
    if (digitsOnly.length === 11) {
      return digitsOnly.replace(
        /(\d{3})(\d{3})(\d{3})(\d{2})/,
        '$1.$2.$3-$4',
      );
    }

    this.logger.warn(
      `contact_identification do pedido ${order.id} não parece um CPF válido: "${raw}"`,
    );
    throw new InvalidBuyerCpfError(
      order.id,
      `esperado 11 dígitos, recebido "${raw}"`,
    );
  }
}
