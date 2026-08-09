import { Controller, Get, HttpCode } from '@nestjs/common';

/**
 * Healthcheck simples para o UptimeRobot apontar (GET /health a cada 5 min).
 * Não depende de nada externo (Resend, filesystem dos e-books) de propósito:
 * o objetivo é só confirmar que o processo Node está de pé.
 */
@Controller('health')
export class HealthController {
  @Get()
  @HttpCode(200)
  check() {
    return {
      status: 'ok',
      service: 'beatriz-watermark-email',
      timestamp: new Date().toISOString(),
    };
  }
}
