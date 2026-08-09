import { Injectable, Logger } from '@nestjs/common';
import { EbookAssetSource } from '../ebook/ebook-asset.service';
import { WatermarkService } from '../watermark/watermark.service';
import { DeliveryService, WatermarkedAttachment } from '../delivery/delivery.service';
import { WatermarkJob } from './watermark-job.type';

/**
 * Coordena o fim do fluxo (Épicos 3 e 4): para cada product_id do job,
 * carrega o e-book original, aplica a marca d'água (tudo em memória) e
 * envia todos os PDFs marcados num único e-mail para o comprador.
 *
 * Nada aqui toca o filesystem além da leitura somente-leitura em
 * EbookAssetSource - o PDF marcado nunca é persistido (US09 / LGPD).
 */
@Injectable()
export class WatermarkOrchestratorService {
  private readonly logger = new Logger(WatermarkOrchestratorService.name);

  constructor(
    private readonly ebookAssetSource: EbookAssetSource,
    private readonly watermarkService: WatermarkService,
    private readonly deliveryService: DeliveryService,
  ) {}

  async process(job: WatermarkJob): Promise<void> {
    const attachments: WatermarkedAttachment[] = [];

    for (const productId of job.product_ids) {
      const originalBytes = await this.ebookAssetSource.load(productId);
      const watermarkedBytes = await this.watermarkService.applyWatermark(
        originalBytes,
        job.buyer_full_name,
        job.buyer_cpf,
      );

      attachments.push({
        filename: `${productId}.pdf`,
        content: Buffer.from(watermarkedBytes),
      });
    }

    await this.deliveryService.sendEbooks(
      job.order_id,
      job.buyer_email,
      job.buyer_full_name,
      attachments,
    );

    this.logger.log(
      `Pedido ${job.order_id} processado com sucesso (${attachments.length} e-book(s) marcado(s) e enviado(s))`,
    );
  }
}
