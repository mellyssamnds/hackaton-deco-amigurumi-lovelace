import { NuvemshopClient } from '../nuvemshop/nuvemshop.client';
import {
  InvalidBuyerCpfError,
  InvalidOrderError,
  OrderService,
} from './order.service';

describe('OrderService', () => {
  function buildService(fetchOrderImpl: () => Promise<unknown>) {
    const nuvemshopClient = {
      fetchOrder: jest.fn().mockImplementation(fetchOrderImpl),
    } as unknown as jest.Mocked<NuvemshopClient>;

    return { service: new OrderService(nuvemshopClient), nuvemshopClient };
  }

  const validRawOrder = {
    id: 12345,
    contact_name: 'Maria da Silva',
    contact_email: 'maria@example.com',
    contact_identification: '123.456.789-00',
    products: [{ product_id: 987, name: 'Amigurumi Lovelace' }],
  };

  it('pedido válido → retorna WatermarkJob correto', async () => {
    const { service } = buildService(async () => validRawOrder);

    const job = await service.buildWatermarkJob('12345');

    expect(job).toEqual({
      order_id: '12345',
      buyer_full_name: 'Maria da Silva',
      buyer_cpf: '123.456.789-00',
      buyer_email: 'maria@example.com',
      product_ids: ['987'],
    });
  });

  it('formata CPF vindo só com dígitos', async () => {
    const { service } = buildService(async () => ({
      ...validRawOrder,
      contact_identification: '12345678900',
    }));

    const job = await service.buildWatermarkJob('12345');

    expect(job.buyer_cpf).toBe('123.456.789-00');
  });

  it('contact_identification ausente → faz fallback para customer.identification', async () => {
    const { service } = buildService(async () => ({
      ...validRawOrder,
      contact_identification: null,
      customer: { identification: '12345678900' },
    }));

    const job = await service.buildWatermarkJob('12345');

    expect(job.buyer_cpf).toBe('123.456.789-00');
  });

  it('pedido com CPF ausente em ambos os campos → InvalidBuyerCpfError (erro tratado)', async () => {
    const { service } = buildService(async () => ({
      ...validRawOrder,
      contact_identification: null,
      customer: { identification: null },
    }));

    await expect(service.buildWatermarkJob('12345')).rejects.toBeInstanceOf(
      InvalidBuyerCpfError,
    );
  });

  it('pedido sem customer e sem contact_identification → InvalidBuyerCpfError (erro tratado)', async () => {
    const { service } = buildService(async () => ({
      ...validRawOrder,
      contact_identification: null,
    }));

    await expect(service.buildWatermarkJob('12345')).rejects.toBeInstanceOf(
      InvalidBuyerCpfError,
    );
  });

  it('pedido com CPF malformado → InvalidBuyerCpfError (erro tratado)', async () => {
    const { service } = buildService(async () => ({
      ...validRawOrder,
      contact_identification: '123',
    }));

    await expect(service.buildWatermarkJob('12345')).rejects.toBeInstanceOf(
      InvalidBuyerCpfError,
    );
  });

  it('payload que não bate com o schema → InvalidOrderError (erro tratado)', async () => {
    const { service } = buildService(async () => ({
      id: 12345,
      contact_email: 'nao-eh-um-email',
      products: [],
    }));

    await expect(service.buildWatermarkJob('12345')).rejects.toBeInstanceOf(
      InvalidOrderError,
    );
  });

  it('falha na busca do pedido na Nuvemshop → erro propagado, sem crash do serviço', async () => {
    const { service } = buildService(async () => {
      throw new Error('timeout na Nuvemshop');
    });

    await expect(service.buildWatermarkJob('12345')).rejects.toThrow(
      'timeout na Nuvemshop',
    );
  });
});