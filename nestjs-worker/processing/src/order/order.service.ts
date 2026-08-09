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
   * Campo confirmado na doc oficial da Nuvemshop (Pendência 1 resolvida):
   * tenta `contact_identification` (raiz do Order) primeiro; se vier vazio,
   * cai para `customer.identification` (objeto Customer aninhado). Ambos
   * podem estar ausentes dependendo do app de checkout da loja - por isso
   * o fallback, em vez de confiar em um único campo.
   *
   * Também aplica uma formatação defensiva: se o valor vier só com dígitos
   * (ex. "12345678900"), formata como CPF (123.456.789-00). Se já vier
   * formatado, mantém como está.
   *
   * Nota: só cobre CPF (11 dígitos). Se algum comprador for pessoa jurídica
   * (CNPJ, 14 dígitos), este método rejeita como CPF malformado - o
   * contrato WatermarkJob (buyer_cpf) hoje só prevê CPF, então isso é uma
   * decisão consciente, não um bug. Compra via CNPJ não é 
   * um caso real a suportar.
   */
  private extractBuyerCpf(order: Order): string {
    const raw =
      order.contact_identification?.trim() ||
      order.customer?.identification?.trim();

    if (!raw) {
      this.logger.warn(
        `Pedido ${order.id} sem CPF em contact_identification e customer.identification.`,
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
      `CPF do pedido ${order.id} não parece válido: "${raw}"`,
    );
    throw new InvalidBuyerCpfError(
      order.id,
      `esperado 11 dígitos, recebido "${raw}"`,
    );
  }
}