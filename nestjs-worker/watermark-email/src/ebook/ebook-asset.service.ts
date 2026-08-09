import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { promises as fs } from 'fs';
import * as path from 'path';

/**
 * Erro tratado: o product_id do pedido não tem um PDF original correspondente
 * em assets/ebooks/. Não adianta reprocessar - é um problema de dado/catálogo.
 */
export class EbookNotFoundError extends Error {
  constructor(productId: string) {
    super(`E-book original não encontrado para product_id=${productId}`);
    this.name = 'EbookNotFoundError';
  }
}

/**
 * Fonte dos PDFs originais dos e-books, por product_id.
 *
 * Hoje: volume Docker local (assets/ebooks/{product_id}.pdf), configurado
 * pela Parte 3. Interface isolada de propósito - trocar para R2/S3 depois
 * é implementar uma nova classe e trocar o provider no módulo, sem mudar
 * quem consome (WatermarkOrchestratorService).
 */
export abstract class EbookAssetSource {
  abstract load(productId: string): Promise<Buffer>;
}

@Injectable()
export class LocalFileEbookAssetSource implements EbookAssetSource {
  private readonly logger = new Logger(LocalFileEbookAssetSource.name);
  private readonly ebooksDir: string;

  constructor(private readonly config: ConfigService) {
    this.ebooksDir = this.config.get<string>('EBOOKS_DIR', 'assets/ebooks');
  }

  async load(productId: string): Promise<Buffer> {
    const filePath = path.join(this.ebooksDir, `${productId}.pdf`);

    try {
      return await fs.readFile(filePath);
    } catch (err) {
      this.logger.warn(`Falha ao ler e-book original em ${filePath}: ${err}`);
      throw new EbookNotFoundError(productId);
    }
  }
}
