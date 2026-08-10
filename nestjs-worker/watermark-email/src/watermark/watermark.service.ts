import { Injectable } from '@nestjs/common';
import { PDFDocument, PDFFont, PDFPage, StandardFonts, degrees, rgb } from 'pdf-lib';
import { WatermarkMode } from '../llm/llm-advisor.service';

const BAR_HEIGHT = 24;
const BAR_FONT_SIZE = 9;

/**
 * Aplica a marca d'água de licenciamento a um PDF, inteiramente em memória
 * (US08, US16). Nunca lê nem escreve nada em disco — quem chama passa os bytes
 * originais e recebe os bytes marcados de volta.
 *
 * Modos suportados (US16):
 *   sutil     → apenas marca diagonal discreta (opacity 0.08) — bom cliente.
 *   padrao    → barra topo + rodapé + diagonal (opacity 0.15) — padrão histórico.
 *   agressiva → barra topo + rodapé + duas diagonais (opacity 0.30) — risco.
 */
@Injectable()
export class WatermarkService {
  async applyWatermark(
    originalPdfBytes: Uint8Array,
    buyerFullName: string,
    buyerCpf: string,
    mode: WatermarkMode = 'padrao',
  ): Promise<Uint8Array> {
    const pdfDoc = await PDFDocument.load(originalPdfBytes);
    const barFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const diagonalFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

    const label = `Produto licenciado para: ${buyerFullName} - CPF: ${buyerCpf}`;

    for (const page of pdfDoc.getPages()) {
      if (mode === 'padrao' || mode === 'agressiva') {
        this.drawBar(page, barFont, label, 'top');
        this.drawBar(page, barFont, label, 'bottom');
      }

      const diagonalOpacity = mode === 'sutil' ? 0.08 : mode === 'agressiva' ? 0.30 : 0.15;
      this.drawDiagonalMark(page, diagonalFont, label, diagonalOpacity, 0.45);

      if (mode === 'agressiva') {
        // Segunda diagonal deslocada para dificultar remoção por recorte
        this.drawDiagonalMark(page, diagonalFont, label, diagonalOpacity, 0.70);
      }
    }

    return pdfDoc.save();
  }

  private drawBar(page: PDFPage, font: PDFFont, text: string, position: 'top' | 'bottom') {
    const { width, height } = page.getSize();
    const y = position === 'top' ? height - BAR_HEIGHT : 0;

    page.drawRectangle({
      x: 0,
      y,
      width,
      height: BAR_HEIGHT,
      color: rgb(0.35, 0.35, 0.35),
    });

    const textWidth = font.widthOfTextAtSize(text, BAR_FONT_SIZE);
    page.drawText(text, {
      x: Math.max((width - textWidth) / 2, 4),
      y: y + (BAR_HEIGHT - BAR_FONT_SIZE) / 2,
      size: BAR_FONT_SIZE,
      font,
      color: rgb(1, 1, 1),
    });
  }

  private drawDiagonalMark(
    page: PDFPage,
    font: PDFFont,
    text: string,
    opacity: number,
    yRatio: number,
  ) {
    const { width, height } = page.getSize();

    page.drawText(text, {
      x: width * 0.12,
      y: height * yRatio,
      size: 22,
      font,
      color: rgb(0.6, 0.6, 0.6),
      opacity,
      rotate: degrees(35),
    });
  }
}
