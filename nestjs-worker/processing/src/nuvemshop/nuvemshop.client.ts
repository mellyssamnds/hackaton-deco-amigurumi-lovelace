import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';

/**
 * Client HTTP para a API da Nuvemshop, responsável por buscar o pedido
 * completo a partir do order_id recebido na fila.
 *
 * Resiliência: falha na API não pode derrubar o consumidor da fila.
 * Aplicamos retry com backoff exponencial simples; se todas as tentativas
 * falharem, o erro é propagado para quem chamou (o QueueConsumer decide
 * então se faz retry da mensagem ou dead-letter).
 */
@Injectable()
export class NuvemshopClient {
  private readonly logger = new Logger(NuvemshopClient.name);
  private readonly http: AxiosInstance;
  private readonly storeId: string;
  private readonly maxRetries: number;
  private readonly baseDelayMs: number;

  constructor(private readonly config: ConfigService) {
    const baseURL = this.config.get<string>(
      'NUVEMSHOP_API_BASE_URL',
      'https://api.nuvemshop.com.br/v1',
    );
    const accessToken = this.config.get<string>('NUVEMSHOP_ACCESS_TOKEN', '');
    this.storeId = this.config.get<string>('NUVEMSHOP_STORE_ID', '');
    this.maxRetries = Number(this.config.get('ORDER_FETCH_MAX_RETRIES', 3));
    this.baseDelayMs = Number(
      this.config.get('ORDER_FETCH_RETRY_BASE_DELAY_MS', 500),
    );

    this.http = axios.create({
      baseURL,
      timeout: 10_000,
      headers: {
        Authentication: `bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'User-Agent': 'amigurumi-lovelace-beatriz (contato@example.com)',
      },
    });
  }

  /**
   * Busca o pedido completo pelo order_id. Faz retry com backoff exponencial
   * (base * 2^tentativa) em erros de rede/5xx. Erros 4xx (ex.: pedido não
   * existe) não são retentados, pois tentar de novo não vai resolver.
   */
  async fetchOrder(orderId: string, storeId?: string): Promise<unknown> {
    const targetStore = storeId ?? this.storeId;
    let lastError: unknown;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const { data } = await this.http.get(
          `/${targetStore}/orders/${orderId}`,
        );
        return data;
      } catch (err) {
        lastError = err;
        const status = axios.isAxiosError(err) ? err.response?.status : undefined;
        const isClientError = status !== undefined && status >= 400 && status < 500;

        if (isClientError) {
          this.logger.warn(
            `Erro ${status} ao buscar pedido ${orderId} na Nuvemshop - não retentável`,
          );
          throw err;
        }

        if (attempt < this.maxRetries) {
          const delay = this.baseDelayMs * 2 ** attempt;
          this.logger.warn(
            `Falha ao buscar pedido ${orderId} (tentativa ${attempt + 1}/${
              this.maxRetries + 1
            }). Retentando em ${delay}ms.`,
          );
          await this.sleep(delay);
        }
      }
    }

    this.logger.error(
      `Todas as tentativas de buscar o pedido ${orderId} falharam`,
    );
    throw lastError;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
