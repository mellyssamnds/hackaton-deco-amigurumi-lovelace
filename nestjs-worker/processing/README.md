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

15 testes cobrindo: `NuvemshopClient` (retry/backoff, erro 4xx sem retry),
`OrderService` (pedido válido, CPF ausente/malformado, payload inválido,
falha na Nuvemshop) e `QueueConsumer` (sucesso, mensagem malformada, erro
de dado, falha de infraestrutura, fila vazia).

## Escopo desta etapa (BACKLOG.md > Parte 2)

- [x] Setup do serviço NestJS (Docker, docker-compose.yml, healthcheck `/health`)
- [x] HTTP Pull Consumer da Cloudflare Queue (polling a cada 5s, ack/retry)
- [x] Busca do pedido completo na API da Nuvemshop a partir do `order_id`
- [x] Validação do pedido completo com Zod (`order.schema.ts`)
- [x] Extração de nome completo e CPF do comprador
- [x] Identificação do(s) produto(s) do pedido e mapeamento para `product_ids`
- [x] Ponto de encaminhamento do `WatermarkJob` para a Parte 3 (`WatermarkJobDispatcher`)

## Pendências / decisões em aberto

1. **Campo real de CPF na Nuvemshop.** `order.schema.ts` usa
   `contact_identification` como placeholder. Confirmar com o time o campo
   real (depende do app de checkout da loja) e ajustar
   `OrderService.extractBuyerCpf()` — é a única função que precisa mudar.
2. **Integração com a Parte 3.** `WatermarkJobDispatcher` hoje só loga o
   job pronto (`LoggingWatermarkJobDispatcher`). Quando a branch
   `yasmine/pdf-watermark-email` estiver pronta, trocar o provider em
   `queue.module.ts` pela implementação real (`WatermarkService` +
   `DeliveryService`), sem alterar o contrato `WatermarkJob`.
3. **`docker-compose.yml` compartilhado.** A Parte 3 deve adicionar seu
   próprio serviço (`watermark-email`) neste mesmo arquivo, sem remover o
   serviço `processing`.

## O que NÃO está nesta etapa

Geração/marca d'água do PDF e envio de e-mail são responsabilidade da
Parte 3 (`yasmine/pdf-watermark-email`). Esta etapa termina no
`WatermarkJob` válido.
