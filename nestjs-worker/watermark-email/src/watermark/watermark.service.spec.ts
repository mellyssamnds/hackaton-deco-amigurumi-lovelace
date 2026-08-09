import { PDFDocument, StandardFonts } from 'pdf-lib';
import { WatermarkService } from './watermark.service';

async function buildSamplePdf(pages = 2): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);

  for (let i = 0; i < pages; i++) {
    const page = doc.addPage([400, 600]);
    page.drawText(`Página de teste ${i + 1}`, { x: 50, y: 300, size: 14, font });
  }

  return doc.save();
}

describe('WatermarkService', () => {
  let service: WatermarkService;

  beforeEach(() => {
    service = new WatermarkService();
  });

  it('gera um PDF válido em memória, preservando o número de páginas', async () => {
    const original = await buildSamplePdf(3);

    const watermarked = await service.applyWatermark(
      original,
      'Maria da Silva',
      '123.456.789-00',
    );

    const resultDoc = await PDFDocument.load(watermarked);
    expect(resultDoc.getPageCount()).toBe(3);
  });

  it('altera os bytes do PDF original (marca d\'água foi de fato desenhada)', async () => {
    const original = await buildSamplePdf(1);

    const watermarked = await service.applyWatermark(
      original,
      'João Pereira',
      '987.654.321-00',
    );

    expect(Buffer.from(watermarked).equals(Buffer.from(original))).toBe(false);
  });

  it('processa PDFs com múltiplas páginas sem lançar erro', async () => {
    const original = await buildSamplePdf(5);

    await expect(
      service.applyWatermark(original, 'Ana Souza', '111.222.333-44'),
    ).resolves.toBeInstanceOf(Uint8Array);
  });
});
