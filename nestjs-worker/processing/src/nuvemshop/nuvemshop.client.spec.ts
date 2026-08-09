import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { NuvemshopClient } from './nuvemshop.client';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('NuvemshopClient', () => {
  const config = new ConfigService({
    NUVEMSHOP_STORE_ID: 'store123',
    NUVEMSHOP_ACCESS_TOKEN: 'token123',
    ORDER_FETCH_MAX_RETRIES: 2,
    ORDER_FETCH_RETRY_BASE_DELAY_MS: 1, // rápido nos testes
  });

  let httpGetMock: jest.Mock;

  beforeEach(() => {
    httpGetMock = jest.fn();
    mockedAxios.create.mockReturnValue({ get: httpGetMock } as any);
    mockedAxios.isAxiosError.mockImplementation(
      (err: any) => !!err?.isAxiosError,
    );
  });

  it('retorna o pedido quando a Nuvemshop responde com sucesso', async () => {
    httpGetMock.mockResolvedValueOnce({ data: { id: '999' } });
    const client = new NuvemshopClient(config);

    const order = await client.fetchOrder('999');

    expect(order).toEqual({ id: '999' });
    expect(httpGetMock).toHaveBeenCalledWith('/store123/orders/999');
  });

  it('faz retry em erro 5xx e depois retorna sucesso', async () => {
    httpGetMock
      .mockRejectedValueOnce({
        isAxiosError: true,
        response: { status: 503 },
      })
      .mockResolvedValueOnce({ data: { id: '999' } });
    const client = new NuvemshopClient(config);

    const order = await client.fetchOrder('999');

    expect(order).toEqual({ id: '999' });
    expect(httpGetMock).toHaveBeenCalledTimes(2);
  });

  it('não faz retry em erro 4xx e propaga o erro imediatamente', async () => {
    httpGetMock.mockRejectedValueOnce({
      isAxiosError: true,
      response: { status: 404 },
    });
    const client = new NuvemshopClient(config);

    await expect(client.fetchOrder('999')).rejects.toBeDefined();
    expect(httpGetMock).toHaveBeenCalledTimes(1);
  });

  it('propaga o erro tratado após esgotar as tentativas em falha persistente', async () => {
    httpGetMock.mockRejectedValue({
      isAxiosError: true,
      response: { status: 500 },
    });
    const client = new NuvemshopClient(config);

    await expect(client.fetchOrder('999')).rejects.toBeDefined();
    // maxRetries=2 => 3 tentativas no total
    expect(httpGetMock).toHaveBeenCalledTimes(3);
  });
});
