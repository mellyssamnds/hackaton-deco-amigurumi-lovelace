import { Controller, Get, HttpCode } from '@nestjs/common';

/**
 * Healthcheck simples para o UptimeRobot apontar (GET /health a cada 5 min).
 * Não depende de nada externo (fila, Nuvemshop) de propósito: o objetivo é
 * só confirmar que o processo Node está de pé, não que as integrações
 * estão saudáveis.
 */
@Controller('health')
export class HealthController {
  @Get()
  @HttpCode(200)
  check() {
    return {
      status: 'ok',
      service: 'beatriz-processing',
      timestamp: new Date().toISOString(),
    };
  }
}
