# hackaton-deco-amigurumi-lovelace

Entrega automática de e-books de amigurumi vendidos na Nuvemshop: a cada
venda, o comprador recebe por e-mail um PDF com marca d'água (nome + CPF),
sem intervenção manual e com custo zero de infraestrutura.

Projeto do hackathon **Agents for Commerce** (Deco).

## Como funciona

```
Nuvemshop (order/paid)
        │  webhook
        ▼
cloudflare-worker            valida assinatura HMAC, dedupe, publica na fila
        │  Cloudflare Queue "beatriz-orders"
        ▼
nestjs-worker/processing     busca o pedido completo na Nuvemshop,
        │                    extrai nome + CPF do comprador, monta o WatermarkJob
        │  HTTP POST /watermark-jobs
        ▼
nestjs-worker/watermark-email  aplica a marca d'água no PDF (pdf-lib, em
                                memória) e envia por e-mail via Resend
```

## Módulos

| Módulo | Responsabilidade | Onde roda |
|---|---|---|
| [`cloudflare-worker`](cloudflare-worker/README.md) | Recebe e valida o webhook `order/paid`, evita reprocessar o mesmo pedido, publica na fila | Cloudflare Workers (free plan) |
| [`nestjs-worker/processing`](nestjs-worker/processing/README.md) | Consome a fila, busca o pedido completo na API da Nuvemshop, valida e monta o `WatermarkJob` | Docker, VM |
| [`nestjs-worker/watermark-email`](nestjs-worker/watermark-email/README.md) | Aplica a marca d'água no PDF e envia o e-book por e-mail | Docker, mesma VM |

Cada módulo tem seu próprio `README.md` com setup, variáveis de ambiente e
comandos de teste. Os dois serviços NestJS sobem juntos via
`nestjs-worker/processing/docker-compose.yml`.

## Custo

Toda a infraestrutura (Cloudflare Workers, Queues, KV) opera dentro dos
limites do Workers Free plan — sem necessidade de upgrade pago. Detalhes em
[`cloudflare-worker/README.md`](cloudflare-worker/README.md#custo).

## Licença

[MIT](LICENSE)
