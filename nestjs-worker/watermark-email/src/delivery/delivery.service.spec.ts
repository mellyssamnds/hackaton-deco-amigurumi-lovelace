import { ConfigService } from '@nestjs/config';
import { DeliveryService, EmailDeliveryError } from './delivery.service';

const sendMock = jest.fn();

jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({
    emails: { send: sendMock },
  })),
}));

function buildConfig(overrides: Record<string, unknown> = {}): ConfigService {
  const values: Record<string, unknown> = {
    RESEND_API_KEY: 'test-key',
    RESEND_FROM_EMAIL: 'entregas@amigurumilovelace.com.br',
    EMAIL_MAX_RETRIES: 2,
    EMAIL_RETRY_BASE_DELAY_MS: 1,
    ...overrides,
  };
  return { get: (key: string, fallback?: unknown) => values[key] ?? fallback } as unknown as ConfigService;
}

describe('DeliveryService', () => {
  beforeEach(() => {
    sendMock.mockReset();
  });

  it('envia o e-mail com os anexos marcados para o buyer_email', async () => {
    sendMock.mockResolvedValueOnce({ data: { id: 'abc' }, error: null });
    const service = new DeliveryService(buildConfig());

    await service.sendEbooks('order-1', 'cliente@example.com', 'Maria da Silva', [
      { filename: 'produto-123.pdf', content: Buffer.from('fake-pdf') },
    ]);

    expect(sendMock).toHaveBeenCalledTimes(1);
    const call = sendMock.mock.calls[0][0];
    expect(call.to).toBe('cliente@example.com');
    expect(call.attachments).toEqual([
      { filename: 'produto-123.pdf', content: Buffer.from('fake-pdf') },
    ]);
  });

  it('faz retry em falha transitória e ainda assim entrega com sucesso', async () => {
    sendMock
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce({ data: { id: 'abc' }, error: null });

    const service = new DeliveryService(buildConfig());

    await service.sendEbooks('order-2', 'cliente@example.com', 'João', [
      { filename: 'a.pdf', content: Buffer.from('x') },
    ]);

    expect(sendMock).toHaveBeenCalledTimes(2);
  });

  it('lança EmailDeliveryError após esgotar as tentativas', async () => {
    sendMock.mockRejectedValue(new Error('fora do ar'));
    const service = new DeliveryService(buildConfig({ EMAIL_MAX_RETRIES: 1 }));

    await expect(
      service.sendEbooks('order-3', 'cliente@example.com', 'Ana', [
        { filename: 'a.pdf', content: Buffer.from('x') },
      ]),
    ).rejects.toBeInstanceOf(EmailDeliveryError);

    expect(sendMock).toHaveBeenCalledTimes(2); // tentativa inicial + 1 retry
  });
});
