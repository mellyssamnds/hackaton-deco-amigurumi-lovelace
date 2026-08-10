import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { z } from 'zod';

/**
 * Modos possíveis de marca d'água.
 *   sutil     → só diagonal discreta (bom cliente, primeira compra)
 *   padrao    → barra topo/rodapé + diagonal (comportamento histórico)
 *   agressiva → barra + duas diagonais + opacidade alta (risco detectado)
 */
export const WatermarkMode = z.enum(['sutil', 'padrao', 'agressiva']);
export type WatermarkMode = z.infer<typeof WatermarkMode>;

/**
 * Schema Zod que parseia a resposta JSON da LLM.
 * A LLM deve retornar EXATAMENTE este formato, sem campos extras.
 */
const LlmResponseSchema = z.object({
  watermarkMode: WatermarkMode,
  emailBody: z.string().min(10),
});

export type LlmAdvice = z.infer<typeof LlmResponseSchema>;

const FALLBACK: LlmAdvice = {
  watermarkMode: 'padrao',
  emailBody: `
    <p>Olá!</p>
    <p>Seu e-book da Amigurumi Lovelace está em anexo, pronto para uso.</p>
    <p>Obrigada pela compra e boas amigurumices! 🧶</p>
  `.trim(),
};

/**
 * Consulta o Google Gemini para:
 *   - US16: decidir o tipo de marca d'água com base no perfil do comprador.
 *   - US17: gerar o corpo HTML personalizado do e-mail de entrega.
 *
 * Em qualquer falha (API indisponível, timeout, resposta inválida) retorna
 * o FALLBACK sem derrubar o fluxo principal.
 */
@Injectable()
export class LlmAdvisorService {
  private readonly logger = new Logger(LlmAdvisorService.name);
  private readonly model: ReturnType<GoogleGenerativeAI['getGenerativeModel']> | null;
  private readonly timeoutMs: number;

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.get<string>('LLM_API_KEY', '');
    const modelName = this.config.get<string>('LLM_MODEL', 'gemini-1.5-flash');
    this.timeoutMs = Number(this.config.get('LLM_TIMEOUT_MS', 8000));

    if (!apiKey) {
      this.logger.warn(
        'LLM_API_KEY não configurada — LlmAdvisorService usará sempre o fallback.',
      );
      this.model = null;
      return;
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    this.model = genAI.getGenerativeModel({ model: modelName });
  }

  /**
   * Consulta a LLM e retorna a decisão de modo de marca d'água e o corpo do e-mail.
   * Se a LLM falhar por qualquer motivo, retorna o FALLBACK.
   *
   * @param buyerFullName  Nome completo do comprador (sem CPF — US11/LGPD).
   * @param productIds     Lista de product_ids do pedido.
   * @param buyerHistory   Histórico opcional do comprador (ex: "2 compras anteriores, nenhum chargeback").
   */
  async advise(
    buyerFullName: string,
    productIds: string[],
    buyerHistory?: string,
  ): Promise<LlmAdvice> {
    if (!this.model) {
      return FALLBACK;
    }

    const prompt = this.buildPrompt(buyerFullName, productIds, buyerHistory);

    try {
      const result = await Promise.race([
        this.model.generateContent(prompt),
        this.timeout(),
      ]);

      const raw = (result as Awaited<ReturnType<typeof this.model.generateContent>>)
        .response.text();

      return this.parse(raw);
    } catch (err) {
      this.logger.warn(
        `LLM indisponível ou timeout — usando fallback (motivo: ${err instanceof Error ? err.message : err})`,
      );
      return FALLBACK;
    }
  }

  // ─── private ────────────────────────────────────────────────────────────────

  private buildPrompt(
    buyerFullName: string,
    productIds: string[],
    buyerHistory?: string,
  ): string {
    const historySection = buyerHistory
      ? `Histórico do comprador: ${buyerHistory}`
      : 'Histórico do comprador: não disponível (primeira compra ou dado ausente).';

    return `
Você é um agente de proteção de conteúdo digital para uma loja de e-books de amigurumi.
Seu trabalho é decidir o nível de marca d'água a aplicar num PDF licenciado e compor um e-mail de entrega personalizado e acolhedor.

DADOS DO PEDIDO:
- Nome do comprador: ${buyerFullName}
- Produtos: ${productIds.join(', ')}
- ${historySection}

REGRAS PARA ESCOLHA DA MARCA D'ÁGUA:
- "sutil": comprador com bom histórico, sem chargebacks, cliente recorrente.
- "padrao": primeira compra ou histórico desconhecido.
- "agressiva": histórico com chargebacks, disputas ou comportamento suspeito.

TAREFA:
Retorne APENAS um JSON válido (sem markdown, sem texto extra) com este formato exato:
{
  "watermarkMode": "sutil" | "padrao" | "agressiva",
  "emailBody": "<p>Corpo HTML do e-mail personalizado, amigável, máximo 4 parágrafos. Mencione o nome do comprador. NÃO mencione CPF.</p>"
}
`.trim();
  }

  private parse(raw: string): LlmAdvice {
    // Remove blocos de código markdown caso a LLM os inclua mesmo pedindo para não
    const cleaned = raw
      .replace(/```json/gi, '')
      .replace(/```/g, '')
      .trim();

    let json: unknown;
    try {
      json = JSON.parse(cleaned);
    } catch {
      this.logger.warn(`LLM retornou JSON inválido — usando fallback. Raw: "${raw.slice(0, 200)}"`);
      return FALLBACK;
    }

    const parsed = LlmResponseSchema.safeParse(json);
    if (!parsed.success) {
      this.logger.warn(
        `Resposta da LLM não passou na validação Zod — usando fallback. Erros: ${parsed.error.message}`,
      );
      return FALLBACK;
    }

    return parsed.data;
  }

  private timeout(): Promise<never> {
    return new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`LLM timeout após ${this.timeoutMs}ms`)), this.timeoutMs),
    );
  }
}
