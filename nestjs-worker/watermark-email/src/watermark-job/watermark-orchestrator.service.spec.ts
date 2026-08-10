import { readFileSync } from 'fs';
import { join } from 'path';
import { EbookAssetSource } from '../ebook/ebook-asset.service';
import { DeliveryService } from '../delivery/delivery.service';
import { WatermarkService } from '../watermark/watermark.service';
import { LlmAdvisorService, LlmAdvice } from '../llm/llm-advisor.service';
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
  let llmAdvisor: jest.Mocked<LlmAdvisorService>;
  let orchestrator: WatermarkOrchestratorService;

  const defaultAdvice: LlmAdvice = {
    watermarkMode: 'padrao',
    emailBody: '<p>Olá, Maria! Seu e-book está em anexo.</p>',
  };

  beforeEach(() => {
    ebookAssetSource = { load: jest.fn() } as unknown as jest.Mocked<EbookAssetSource>;
    watermarkService = {
      applyWatermark: jest.fn(),
    } as unknown as jest.Mocked<WatermarkService>;
    deliveryService = { sendEbooks: jest.fn() } as unknown as jest.Mocked<DeliveryService>;
    llmAdvisor = { advise: jest.fn() } as unknown as jest.Mocked<LlmAdvisorService>;

    ebookAssetSource.load.mockImplementation(async (productId) =>
      Buffer.from(`pdf-original-${productId}`),
    );
    watermarkService.applyWatermark.mockImplementation(async (bytes) =>
      Buffer.concat([Buffer.from(bytes), Buffer.from('-marcado')]),
    );
    deliveryService.sendEbooks.mockResolvedValue(undefined);
    llmAdvisor.advise.mockResolvedValue(defaultAdvice);

    orchestrator = new WatermarkOrchestratorService(
      ebookAssetSource,
      watermarkService,
      deliveryService,
      llmAdvisor,
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

  it('passa o watermarkMode retornado pela LLM ao WatermarkService (US16)', async () => {
    llmAdvisor.advise.mockResolvedValueOnce({
      watermarkMode: 'sutil',
      emailBody: '<p>Olá!</p>',
    });

    await orchestrator.process(job);

    expect(watermarkService.applyWatermark).toHaveBeenCalledWith(
      expect.anything(),
      job.buyer_full_name,
      job.buyer_cpf,
      'sutil',
    );
  });

  it('passa o emailBody retornado pela LLM ao DeliveryService (US17)', async () => {
    const customBody = '<p>E-mail personalizado pela LLM!</p>';
    llmAdvisor.advise.mockResolvedValueOnce({
      watermarkMode: 'padrao',
      emailBody: customBody,
    });

    await orchestrator.process(job);

    expect(deliveryService.sendEbooks).toHaveBeenCalledWith(
      job.order_id,
      job.buyer_email,
      job.buyer_full_name,
      expect.any(Array),
      customBody,
    );
  });

  it('nunca escreve o PDF gerado em disco (LGPD / US09)', () => {
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


