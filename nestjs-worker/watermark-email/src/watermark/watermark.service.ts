import { Injectable } from '@nestjs/common';
import { PDFDocument, PDFFont, PDFPage, StandardFonts, degrees, rgb } from 'pdf-lib';

const BAR_HEIGHT = 24;
const BAR_FONT_SIZE = 9;
const DIAGONAL_FONT_SIZE = 22;

/**
 * Aplica a marca d'água de licenciamento a um PDF, inteiramente em memória
 * (US08). Nunca lê nem escreve nada em disco - quem chama passa os bytes
 * originais e recebe os bytes marcados de volta.
 *
 * Marca aplicada (BACKLOG.md > Parte 3):
 *   - barra cinza no topo e rodapé de cada página, texto branco centralizado:
 *     "Produto licenciado para: {Nome completo} - CPF: {CPF formatado}"
 *   - marca diagonal discreta no corpo da página (reforço anti-recorte)
 */
@Injectable()
export class WatermarkService {
  async applyWatermark(
    originalPdfBytes: Uint8Array,
    buyerFullName: string,
    buyerCpf: string,
  ): Promise<Uint8Array> {
    const pdfDoc = await PDFDocument.load(originalPdfBytes);
    const barFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const diagonalFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

    const label = `Produto licenciado para: ${buyerFullName} - CPF: ${buyerCpf}`;

    for (const page of pdfDoc.getPages()) {
      this.drawBar(page, barFont, label, 'top');
      this.drawBar(page, barFont, label, 'bottom');
      this.drawDiagonalMark(page, diagonalFont, label);
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

  private drawDiagonalMark(page: PDFPage, font: PDFFont, text: string) {
    const { width, height } = page.getSize();

    page.drawText(text, {
      x: width * 0.12,
      y: height * 0.45,
      size: DIAGONAL_FONT_SIZE,
      font,
      color: rgb(0.6, 0.6, 0.6),
      opacity: 0.15,
      rotate: degrees(35),
    });
  }
}
