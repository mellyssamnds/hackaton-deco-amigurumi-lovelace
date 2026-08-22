import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { LlmAdvisorService, LlmAdvice } from './llm-advisor.service';

const FALLBACK: LlmAdvice = {
  watermarkMode: 'padrao',
  emailBody: expect.stringContaining('<p>'),
};

describe('LlmAdvisorService', () => {
  let service: LlmAdvisorService;
  let mockGenerateContent: jest.Mock;

  const buildModule = async (apiKey: string) => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LlmAdvisorService,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string, def?: unknown) => {
              const map: Record<string, unknown> = {
                LLM_API_KEY: apiKey,
                LLM_MODEL: 'gemini-flash-latest',
                LLM_TIMEOUT_MS: 5000,
              };
              return map[key] ?? def;
            },
          },
        },
      ],
    }).compile();

    service = module.get<LlmAdvisorService>(LlmAdvisorService);

    // Injeta mock no modelo interno (apenas quando a key está presente)
    if (apiKey) {
      mockGenerateContent = jest.fn();
      (service as unknown as { model: { generateContent: jest.Mock } }).model = {
        generateContent: mockGenerateContent,
      };
    }
  };

  describe('quando LLM_API_KEY não está configurada', () => {
    beforeEach(() => buildModule(''));

    it('retorna o fallback sem lançar exceção', async () => {
      const result = await service.advise('Ana Lima', ['ebook-1']);
      expect(result.watermarkMode).toBe('padrao');
      expect(result.emailBody).toBeTruthy();
    });
  });

  describe('quando LLM_API_KEY está configurada', () => {
    beforeEach(() => buildModule('fake-key'));

    it('parseia resposta válida da LLM — modo sutil', async () => {
      const llmResponse = JSON.stringify({
        watermarkMode: 'sutil',
        emailBody: '<p>Olá, Ana! Obrigada pela compra.</p>',
      });
      mockGenerateContent.mockResolvedValueOnce({
        response: { text: () => llmResponse },
      });

      const result = await service.advise('Ana Lima', ['ebook-1'], '3 compras, nenhum chargeback');
      expect(result.watermarkMode).toBe('sutil');
      expect(result.emailBody).toContain('Ana');
    });

    it('parseia resposta válida da LLM — modo agressiva', async () => {
      const llmResponse = JSON.stringify({
        watermarkMode: 'agressiva',
        emailBody: '<p>Olá! Seu e-book está em anexo.</p>',
      });
      mockGenerateContent.mockResolvedValueOnce({
        response: { text: () => llmResponse },
      });

      const result = await service.advise('Carlos Silva', ['ebook-2'], '1 chargeback registrado');
      expect(result.watermarkMode).toBe('agressiva');
    });

    it('retorna fallback quando a LLM lança exceção (rede)', async () => {
      mockGenerateContent.mockRejectedValueOnce(new Error('Network error'));

      const result = await service.advise('Ana Lima', ['ebook-1']);
      expect(result.watermarkMode).toBe('padrao');
    });

    it('retorna fallback quando a resposta não é JSON válido', async () => {
      mockGenerateContent.mockResolvedValueOnce({
        response: { text: () => 'isso não é JSON' },
      });

      const result = await service.advise('Ana Lima', ['ebook-1']);
      expect(result.watermarkMode).toBe('padrao');
    });

    it('retorna fallback quando o JSON não bate com o schema Zod', async () => {
      const badResponse = JSON.stringify({
        watermarkMode: 'invalido', // não é um dos três modos válidos
        emailBody: '<p>ok</p>',
      });
      mockGenerateContent.mockResolvedValueOnce({
        response: { text: () => badResponse },
      });

      const result = await service.advise('Ana Lima', ['ebook-1']);
      expect(result.watermarkMode).toBe('padrao');
    });

    it('remove blocos markdown da resposta antes de parsear', async () => {
      const llmResponse =
        '```json\n' +
        JSON.stringify({
          watermarkMode: 'padrao',
          emailBody: '<p>Olá! Ebook em anexo.</p>',
        }) +
        '\n```';
      mockGenerateContent.mockResolvedValueOnce({
        response: { text: () => llmResponse },
      });

      const result = await service.advise('Ana Lima', ['ebook-1']);
      expect(result.watermarkMode).toBe('padrao');
    });
  });
});
