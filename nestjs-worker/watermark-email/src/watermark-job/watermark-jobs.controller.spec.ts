import { BadRequestException, UnprocessableEntityException } from '@nestjs/common';
import { EbookNotFoundError } from '../ebook/ebook-asset.service';
import { WatermarkOrchestratorService } from './watermark-orchestrator.service';
import { WatermarkJobsController } from './watermark-jobs.controller';

describe('WatermarkJobsController', () => {
  const validJob = {
    order_id: 'order-1',
    buyer_full_name: 'Maria da Silva',
    buyer_cpf: '123.456.789-00',
    buyer_email: 'maria@example.com',
    product_ids: ['produto-a'],
  };

  let orchestrator: jest.Mocked<WatermarkOrchestratorService>;
  let controller: WatermarkJobsController;

  beforeEach(() => {
    orchestrator = { process: jest.fn() } as unknown as jest.Mocked<WatermarkOrchestratorService>;
    controller = new WatermarkJobsController(orchestrator);
  });

  it('aceita um WatermarkJob válido e dispara o processamento', async () => {
    orchestrator.process.mockResolvedValue(undefined);

    const result = await controller.receive(validJob);

    expect(orchestrator.process).toHaveBeenCalledWith(validJob);
    expect(result).toEqual({ status: 'sent', order_id: 'order-1' });
  });

  it('rejeita um payload que não bate com o contrato WatermarkJob', async () => {
    await expect(controller.receive({ order_id: 'order-1' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(orchestrator.process).not.toHaveBeenCalled();
  });

  it('retorna 422 quando o e-book original não é encontrado', async () => {
    orchestrator.process.mockRejectedValue(new EbookNotFoundError('produto-a'));

    await expect(controller.receive(validJob)).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
  });
});
