import { ConfigService } from '@nestjs/config';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { EbookNotFoundError, LocalFileEbookAssetSource } from './ebook-asset.service';

describe('LocalFileEbookAssetSource', () => {
  let tmpDir: string;
  let service: LocalFileEbookAssetSource;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ebooks-test-'));
    await fs.writeFile(path.join(tmpDir, 'produto-123.pdf'), Buffer.from('%PDF-1.4 conteudo-fake'));

    const config = { get: () => tmpDir } as unknown as ConfigService;
    service = new LocalFileEbookAssetSource(config);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('carrega o PDF original a partir do product_id', async () => {
    const bytes = await service.load('produto-123');
    expect(bytes.toString()).toContain('conteudo-fake');
  });

  it('lança EbookNotFoundError se o product_id não tiver PDF correspondente', async () => {
    await expect(service.load('produto-inexistente')).rejects.toBeInstanceOf(
      EbookNotFoundError,
    );
  });
});
