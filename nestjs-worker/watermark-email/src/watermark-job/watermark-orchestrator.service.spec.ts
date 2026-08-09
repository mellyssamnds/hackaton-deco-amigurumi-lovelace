import { readFileSync } from 'fs';
import { join } from 'path';
import { EbookAssetSource } from '../ebook/ebook-asset.service';
import { DeliveryService } from '../delivery/delivery.service';
import { WatermarkService } from '../watermark/watermark.service';
import { WatermarkJob } from './watermark-job.type';
import { WatermarkOrchestratorService } from './watermark-orchestrator.service';

describe('WatermarkOrchestratorService', () => {
  const job: WatermarkJob = {
    order_id: 'order-1',
    buyer_full_name: 'Maria da Silva',
    buyer_cpf: '123.456.789-00',
    buyer_email: 'maria@example.com',
    product_ids: ['produto-a', 'produto-b'],
  };

  let ebookAssetSource: jest.Mocked<EbookAssetSource>;
  let watermarkService: jest.Mocked<WatermarkService>;
  let deliveryService: jest.Mocked<DeliveryService>;
  let orchestrator: WatermarkOrchestratorService;

  beforeEach(() => {
    ebookAssetSource = { load: jest.fn() } as unknown as jest.Mocked<EbookAssetSource>;
    watermarkService = {
      applyWatermark: jest.fn(),
    } as unknown as jest.Mocked<WatermarkService>;
    deliveryService = { sendEbooks: jest.fn() } as unknown as jest.Mocked<DeliveryService>;

    ebookAssetSource.load.mockImplementation(async (productId) =>
      Buffer.from(`pdf-original-${productId}`),
    );
    watermarkService.applyWatermark.mockImplementation(async (bytes) =>
      Buffer.concat([Buffer.from(bytes), Buffer.from('-marcado')]),
    );
    deliveryService.sendEbooks.mockResolvedValue(undefined);

    orchestrator = new WatermarkOrchestratorService(
      ebookAssetSource,
      watermarkService,
      deliveryService,
    );
  });

  it('carrega, marca e envia um PDF por produto do pedido', async () => {
    await orchestrator.process(job);

    expect(ebookAssetSource.load).toHaveBeenCalledWith('produto-a');
    expect(ebookAssetSource.load).toHaveBeenCalledWith('produto-b');
    expect(watermarkService.applyWatermark).toHaveBeenCalledTimes(2);

    expect(deliveryService.sendEbooks).toHaveBeenCalledTimes(1);
    const [orderId, buyerEmail, buyerName, attachments] =
      deliveryService.sendEbooks.mock.calls[0];
    expect(orderId).toBe('order-1');
    expect(buyerEmail).toBe('maria@example.com');
    expect(buyerName).toBe('Maria da Silva');
    expect(attachments).toEqual([
      { filename: 'produto-a.pdf', content: expect.any(Buffer) },
      { filename: 'produto-b.pdf', content: expect.any(Buffer) },
    ]);
  });

  it('nunca escreve o PDF gerado em disco (LGPD / US09)', () => {
    // O orquestrador só deve ler (via EbookAssetSource) e enviar (via
    // DeliveryService) - nenhuma escrita em disco deve existir no fluxo.
    const source = readFileSync(
      join(__dirname, 'watermark-orchestrator.service.ts'),
      'utf-8',
    );
    expect(source).not.toMatch(/writeFile|createWriteStream/);
  });

  it('propaga o erro se um dos e-books não for encontrado', async () => {
    ebookAssetSource.load.mockRejectedValueOnce(new Error('não encontrado'));

    await expect(orchestrator.process(job)).rejects.toThrow('não encontrado');
    expect(deliveryService.sendEbooks).not.toHaveBeenCalled();
  });
});
