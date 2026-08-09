import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  const logger = new Logger('Bootstrap');
  const port = process.env.PORT ? Number(process.env.PORT) : 3001;

  await app.listen(port);
  logger.log(`beatriz-watermark-email ouvindo na porta ${port}`);
}

bootstrap();
