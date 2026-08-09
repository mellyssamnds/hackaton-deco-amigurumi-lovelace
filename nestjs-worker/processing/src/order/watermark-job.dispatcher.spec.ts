import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import {
  HttpWatermarkJobDispatcher,
  WatermarkDispatchError,
  WatermarkJobRejectedError,
} from './watermark-job.dispatcher';
import { WatermarkJob } from './watermark-job.type';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('HttpWatermarkJobDispatcher', () => {
  const config = new ConfigService({
    WATERMARK_EMAIL_URL: 'http://watermark-email:3001',
    WATERMARK_DISPATCH_MAX_RETRIES: 2,
    WATERMARK_DISPATCH_RETRY_BASE_DELAY_MS: 1, // rápido nos testes
  });

  const job: WatermarkJob = {
    order_id: '1001',
    buyer_full_name: 'Maria da Silva',
    buyer_cpf: '123.456.789-00',
    buyer_email: 'maria@example.com',
    product_ids: ['produto-a'],
  };

  let httpPostMock: jest.Mock;

  beforeEach(() => {
    httpPostMock = jest.fn();
    mockedAxios.create.mockReturnValue({ post: httpPostMock } as any);
    mockedAxios.isAxiosError.mockImplementation((err: any) => !!err?.isAxiosError);
  });

  it('entrega o job com sucesso (202) em uma única chamada', async () => {
    httpPostMock.mockResolvedValueOnce({ status: 202, data: { status: 'sent' } });
    const dispatcher = new HttpWatermarkJobDispatcher(config);

    await expect(dispatcher.dispatch(job)).resolves.toBeUndefined();
    expect(httpPostMock).toHaveBeenCalledWith('/watermark-jobs', job);
    expect(httpPostMock).toHaveBeenCalledTimes(1);
  });

  it('faz retry em erro 5xx/rede e depois entrega com sucesso', async () => {
    httpPostMock
      .mockRejectedValueOnce({ isAxiosError: true, response: { status: 503 } })
      .mockResolvedValueOnce({ status: 202, data: { status: 'sent' } });
    const dispatcher = new HttpWatermarkJobDispatcher(config);

    await expect(dispatcher.dispatch(job)).resolves.toBeUndefined();
    expect(httpPostMock).toHaveBeenCalledTimes(2);
  });

  it('não faz retry em erro 4xx (payload rejeitado) e propaga WatermarkJobRejectedError', async () => {
    httpPostMock.mockRejectedValueOnce({ isAxiosError: true, response: { status: 422 } });
    const dispatcher = new HttpWatermarkJobDispatcher(config);

    await expect(dispatcher.dispatch(job)).rejects.toBeInstanceOf(WatermarkJobRejectedError);
    expect(httpPostMock).toHaveBeenCalledTimes(1);
  });

  it('propaga WatermarkDispatchError após esgotar as tentativas em falha persistente, com mensagem legível (não "[object Object]")', async () => {
    httpPostMock.mockRejectedValue({
      isAxiosError: true,
      response: { status: 500 },
      message: 'Request failed with status code 500',
    });
    const dispatcher = new HttpWatermarkJobDispatcher(config);

    let caught: unknown;
    try {
      await dispatcher.dispatch(job);
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(WatermarkDispatchError);
    expect((caught as Error).message).toContain('HTTP 500');
    expect((caught as Error).message).not.toContain('[object Object]');
    // maxRetries=2 => 3 tentativas no total
    expect(httpPostMock).toHaveBeenCalledTimes(3);
  });

  it('propaga WatermarkDispatchError em falha de rede (sem response) após esgotar tentativas, preservando a mensagem original', async () => {
    httpPostMock.mockRejectedValue({ isAxiosError: true, message: 'timeout of 15000ms exceeded' });
    const dispatcher = new HttpWatermarkJobDispatcher(config);

    await expect(dispatcher.dispatch(job)).rejects.toMatchObject({
      message: expect.stringContaining('timeout of 15000ms exceeded'),
    });
    expect(httpPostMock).toHaveBeenCalledTimes(3);
  });

  it('usa os defaults (3 tentativas, 500ms) quando as envs de retry são inválidas, em vez de virar NaN e falhar sem tentar', async () => {
    const invalidConfig = new ConfigService({
      WATERMARK_EMAIL_URL: 'http://watermark-email:3001',
      WATERMARK_DISPATCH_MAX_RETRIES: 'not-a-number',
      WATERMARK_DISPATCH_RETRY_BASE_DELAY_MS: -100,
    });
    httpPostMock.mockRejectedValue({ isAxiosError: true, response: { status: 500 } });
    const dispatcher = new HttpWatermarkJobDispatcher(invalidConfig);

    await expect(dispatcher.dispatch(job)).rejects.toBeInstanceOf(WatermarkDispatchError);
    // default de maxRetries é 3 => 4 tentativas no total
    expect(httpPostMock).toHaveBeenCalledTimes(4);
  });
});
