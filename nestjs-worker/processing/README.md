# nestjs-worker — Parte 2 (processing)

Branch: `pessoa2/nestjs-queue-processing`

Consome a Cloudflare Queue `beatriz-orders`, busca o pedido completo na
Nuvemshop, valida e monta o `WatermarkJob` consumido pela Parte 3.

## Rodando localmente

```bash
cp .env.example .env   # preencha CF_* e NUVEMSHOP_*
npm install
npm run start:dev
```

`GET http://localhost:3000/health` deve responder `200 { status: "ok" }`.

## Rodando com Docker (mesmo fluxo da VM em produção)

```bash
docker compose up -d --build
```

## Testes

```bash
npm test
```

26 testes cobrindo: `NuvemshopClient` (retry/backoff, erro 4xx sem retry),
`OrderService` (pedido válido, fallback `contact_identification` →
`customer.identification`, CPF ausente em ambos os campos, CPF malformado,
payload inválido, falha na Nuvemshop), `QueueConsumer` (sucesso, mensagem
malformada, erro de dado, falha de infraestrutura, fila vazia) e
`HttpWatermarkJobDispatcher` (entrega com sucesso, retry em 5xx/rede, erro
4xx sem retry, falha persistente após esgotar tentativas).

## Escopo desta etapa (BACKLOG.md > Parte 2)

- [x] Setup do serviço NestJS (Docker, docker-compose.yml, healthcheck `/health`)
- [x] HTTP Pull Consumer da Cloudflare Queue (polling a cada 5s, ack/retry)
- [x] Busca do pedido completo na API da Nuvemshop a partir do `order_id`
- [x] Validação do pedido completo com Zod (`order.schema.ts`)
- [x] Extração de nome completo e CPF do comprador
- [x] Identificação do(s) produto(s) do pedido e mapeamento para `product_ids`
- [x] Ponto de encaminhamento do `WatermarkJob` para a Parte 3 (`WatermarkJobDispatcher`)
- [x] Integração real com a Parte 3 via HTTP (`HttpWatermarkJobDispatcher`)
- [x] `docker-compose.yml` compartilhado com o serviço `watermark-email`

## Integração com a Parte 3 (fechada)

Os dois serviços rodam como containers Docker separados na mesma VM
(`docker-compose.yml`, serviço `watermark-email` na porta 3001). A entrega
do `WatermarkJob` acontece via `POST {WATERMARK_EMAIL_URL}/watermark-jobs`,
implementado em `HttpWatermarkJobDispatcher`
(`src/order/watermark-job.dispatcher.ts`) e configurado como provider
default de `WatermarkJobDispatcher` em `queue.module.ts`.

Resiliência: mesmo padrão de retry com backoff exponencial do
`NuvemshopClient` — erros de rede/5xx são retentados
(`WATERMARK_DISPATCH_MAX_RETRIES`, default 3) e, se persistirem após
esgotar as tentativas, propagam `WatermarkDispatchError` (o
`QueueConsumer` trata como falha de infraestrutura: mensagem volta para
retry na fila). Erros 4xx (payload rejeitado pela Parte 3, ex.: e-book
inexistente para o `product_id`) não são retentados e propagam
`WatermarkJobRejectedError`, tratado pelo `QueueConsumer` como erro de
dado — igual a `InvalidOrderError`/`InvalidBuyerCpfError`: ack imediato
(sem retentar indefinidamente), registrado em log para investigação
manual.

`LoggingWatermarkJobDispatcher` continua disponível na mesma classe, mas
só para uso em testes/dev — não é mais o provider de produção.

## Pendências / decisões em aberto

1. ~~**Campo real de CPF na Nuvemshop.**~~ **Resolvida ([PR #5](https://github.com/mellyssamnds/hackaton-deco-amigurumi-lovelace/pull/5)).**

   `contact_identification` (raiz do `Order`) foi confirmado na doc oficial
   da API (2025-03) como o campo correto, com fallback para
   `customer.identification` (objeto `Customer` aninhado) quando o
   primeiro vier vazio — implementado em
   `OrderService.extractBuyerCpf()`. Compra via CNPJ (pessoa jurídica)
   não é um caso real a suportar; o método só aceita CPF (11 dígitos).
   Ainda vale testar com um pedido real da loja para confirmar que o
   checkout usado de fato popula um dos dois campos em produção.

## O que NÃO está nesta etapa

Geração/marca d'água do PDF e envio de e-mail são responsabilidade da
Parte 3 (serviço `watermark-email`, branch `yasmine/pdf-watermark-email`).
Esta etapa termina no `WatermarkJob` válido.
