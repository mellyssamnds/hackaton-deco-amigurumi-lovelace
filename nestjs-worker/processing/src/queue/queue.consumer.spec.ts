import { ConfigService } from '@nestjs/config';
import { CloudflareQueueClient } from './cloudflare-queue.client';
import { QueueConsumer } from './queue.consumer';
import { InvalidBuyerCpfError } from '../order/order.service';
import { WatermarkDispatchError, WatermarkJobRejectedError } from '../order/watermark-job.dispatcher';
import { WatermarkJob } from '../order/watermark-job.type';

describe('QueueConsumer', () => {
  function buildConsumer(opts: {
    messages: any[];
    buildWatermarkJob: (orderId: string) => Promise<WatermarkJob>;
    dispatch?: (job: WatermarkJob) => Promise<void>;
  }) {
    const queueClient = {
      pull: jest.fn().mockResolvedValue(opts.messages),
      ack: jest.fn().mockResolvedValue(undefined),
      retry: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<CloudflareQueueClient>;

    const orderService = {
      buildWatermarkJob: jest.fn().mockImplementation(opts.buildWatermarkJob),
    } as any;

    const dispatcher = {
      dispatch: jest.fn().mockImplementation(opts.dispatch ?? (async () => undefined)),
    };

    const consumer = new QueueConsumer(
      queueClient,
      orderService,
      dispatcher,
      new ConfigService({}),
    );

    return { consumer, queueClient, orderService, dispatcher };
  }

  const validEnvelope = {
    order_id: '123',
    store_id: 'store1',
    received_at: new Date().toISOString(),
  };

  it('processa mensagem válida com sucesso: monta job, despacha e faz ack', async () => {
    const job: WatermarkJob = {
      order_id: '123',
      buyer_full_name: 'Maria',
      buyer_cpf: '123.456.789-00',
      buyer_email: 'maria@example.com',
      product_ids: ['1'],
    };

    const { consumer, queueClient, dispatcher } = buildConsumer({
      messages: [{ id: 'm1', lease_id: 'lease-1', body: validEnvelope }],
      buildWatermarkJob: async () => job,
    });

    await consumer.pollOnce();

    expect(dispatcher.dispatch).toHaveBeenCalledWith(job);
    expect(queueClient.ack).toHaveBeenCalledWith(['lease-1']);
    expect(queueClient.retry).toHaveBeenCalledWith([]);
  });

  it('mensagem malformada (fora do contrato QueueMessage) → ack, sem chamar OrderService', async () => {
    const { consumer, queueClient, orderService } = buildConsumer({
      messages: [{ id: 'm1', lease_id: 'lease-1', body: { foo: 'bar' } }],
      buildWatermarkJob: async () => {
        throw new Error('não deveria ser chamado');
      },
    });

    await consumer.pollOnce();

    expect(orderService.buildWatermarkJob).not.toHaveBeenCalled();
    expect(queueClient.ack).toHaveBeenCalledWith(['lease-1']);
  });

  it('erro de dado (CPF inválido) → ack (não fica preso reprocessando para sempre)', async () => {
    const { consumer, queueClient } = buildConsumer({
      messages: [{ id: 'm1', lease_id: 'lease-1', body: validEnvelope }],
      buildWatermarkJob: async () => {
        throw new InvalidBuyerCpfError('123', 'ausente');
      },
    });

    await consumer.pollOnce();

    expect(queueClient.ack).toHaveBeenCalledWith(['lease-1']);
    expect(queueClient.retry).toHaveBeenCalledWith([]);
  });

  it('falha de infraestrutura (ex.: timeout na Nuvemshop) → retry, não derruba o consumidor', async () => {
    const { consumer, queueClient } = buildConsumer({
      messages: [{ id: 'm1', lease_id: 'lease-1', body: validEnvelope }],
      buildWatermarkJob: async () => {
        throw new Error('timeout na Nuvemshop');
      },
    });

    await expect(consumer.pollOnce()).resolves.not.toThrow();

    expect(queueClient.retry).toHaveBeenCalledWith(['lease-1']);
    expect(queueClient.ack).toHaveBeenCalledWith([]);
  });

  it('Parte 3 rejeita o job (4xx, WatermarkJobRejectedError) → ack, não fica retentando indefinidamente', async () => {
    const job: WatermarkJob = {
      order_id: '123',
      buyer_full_name: 'Maria',
      buyer_cpf: '123.456.789-00',
      buyer_email: 'maria@example.com',
      product_ids: ['1'],
    };

    const { consumer, queueClient } = buildConsumer({
      messages: [{ id: 'm1', lease_id: 'lease-1', body: validEnvelope }],
      buildWatermarkJob: async () => job,
      dispatch: async () => {
        throw new WatermarkJobRejectedError('watermark-email respondeu 422');
      },
    });

    await consumer.pollOnce();

    expect(queueClient.ack).toHaveBeenCalledWith(['lease-1']);
    expect(queueClient.retry).toHaveBeenCalledWith([]);
  });

  it('falha de infraestrutura ao entregar à Parte 3 (WatermarkDispatchError) → retry', async () => {
    const job: WatermarkJob = {
      order_id: '123',
      buyer_full_name: 'Maria',
      buyer_cpf: '123.456.789-00',
      buyer_email: 'maria@example.com',
      product_ids: ['1'],
    };

    const { consumer, queueClient } = buildConsumer({
      messages: [{ id: 'm1', lease_id: 'lease-1', body: validEnvelope }],
      buildWatermarkJob: async () => job,
      dispatch: async () => {
        throw new WatermarkDispatchError('falha de rede ao chamar watermark-email');
      },
    });

    await consumer.pollOnce();

    expect(queueClient.retry).toHaveBeenCalledWith(['lease-1']);
    expect(queueClient.ack).toHaveBeenCalledWith([]);
  });

  it('fila vazia → não chama ack/retry', async () => {
    const { consumer, queueClient } = buildConsumer({
      messages: [],
      buildWatermarkJob: async () => {
        throw new Error('não deveria ser chamado');
      },
    });

    await consumer.pollOnce();

    expect(queueClient.ack).not.toHaveBeenCalled();
    expect(queueClient.retry).not.toHaveBeenCalled();
  });
});
