import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

export interface WatermarkedAttachment {
  filename: string;
  content: Buffer;
}

/**
 * Erro tratado: todas as tentativas de envio por e-mail falharam.
 * Quem chama decide o que fazer (ex.: retornar 502 no controller, ou
 * reenfileirar o job numa versão futura) - não perder o pedido (US10).
 */
export class EmailDeliveryError extends Error {
  constructor(orderId: string, cause: unknown) {
    super(`Falha ao enviar e-book do pedido ${orderId} por e-mail: ${cause}`);
    this.name = 'EmailDeliveryError';
  }
}

/**
 * Envio do(s) PDF(s) marcados por e-mail via Resend (US10), com retry em
 * falhas transitórias (US10 - "não perder o pedido em caso de falha do
 * Resend"). Loga sucesso/falha sem incluir CPF (US11).
 */
@Injectable()
export class DeliveryService {
  private readonly logger = new Logger(DeliveryService.name);
  private readonly resend: Resend;
  private readonly fromEmail: string;
  private readonly maxRetries: number;
  private readonly baseDelayMs: number;

  constructor(private readonly config: ConfigService) {
    this.resend = new Resend(this.config.get<string>('RESEND_API_KEY', ''));
    this.fromEmail = this.config.get<string>(
      'RESEND_FROM_EMAIL',
      'entregas@amigurumilovelace.com.br',
    );
    this.maxRetries = Number(this.config.get('EMAIL_MAX_RETRIES', 3));
    this.baseDelayMs = Number(this.config.get('EMAIL_RETRY_BASE_DELAY_MS', 500));
  }

  async sendEbooks(
    orderId: string,
    buyerEmail: string,
    buyerFullName: string,
    attachments: WatermarkedAttachment[],
  ): Promise<void> {
    let lastError: unknown;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const { error } = await this.resend.emails.send({
          from: this.fromEmail,
          to: buyerEmail,
          subject: 'Seu e-book Amigurumi Lovelace chegou!',
          html: this.buildEmailHtml(buyerFullName),
          attachments: attachments.map((a) => ({
            filename: a.filename,
            content: a.content,
          })),
        });

        if (error) {
          throw new Error(error.message);
        }

        this.logger.log(
          `E-book(s) enviado(s) com sucesso para o pedido ${orderId} (${attachments.length} anexo(s))`,
        );
        return;
      } catch (err) {
        lastError = err;

        if (attempt < this.maxRetries) {
          const delay = this.baseDelayMs * 2 ** attempt;
          this.logger.warn(
            `Falha ao enviar e-mail do pedido ${orderId} (tentativa ${attempt + 1}/${
              this.maxRetries + 1
            }). Retentando em ${delay}ms.`,
          );
          await this.sleep(delay);
        }
      }
    }

    this.logger.error(`Todas as tentativas de envio falharam para o pedido ${orderId}`);
    throw new EmailDeliveryError(orderId, lastError);
  }

  private buildEmailHtml(buyerFullName: string): string {
    const safeName = this.escapeHtml(buyerFullName);
    return `
      <p>Olá, ${safeName}!</p>
      <p>Seu e-book da Amigurumi Lovelace está em anexo, pronto para uso.</p>
      <p>Obrigada pela compra e boas amigurumices!</p>
    `.trim();
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
