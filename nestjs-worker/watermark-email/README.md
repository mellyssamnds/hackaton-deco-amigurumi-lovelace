# nestjs-worker — Parte 3 (watermark-email)

Branch: `yasmine/pdf-watermark-email`

Recebe o `WatermarkJob` montado pela Parte 2, carrega o e-book original
correspondente a cada `product_id`, aplica a marca d'água com `pdf-lib`
(tudo em memória) e envia o(s) PDF(s) marcado(s) por e-mail via Resend.

## Rodando localmente

```bash
cp .env.example .env   # preencha RESEND_API_KEY
# coloque PDFs de teste em ../assets/ebooks/{product_id}.pdf
npm install
npm run start:dev
```

`GET http://localhost:3001/health` deve responder `200 { status: "ok" }`.

Para simular um job da Parte 2:

```bash
curl -X POST http://localhost:3001/watermark-jobs \
  -H "Content-Type: application/json" \
  -d '{
    "order_id": "1001",
    "buyer_full_name": "Maria da Silva",
    "buyer_cpf": "123.456.789-00",
    "buyer_email": "maria@example.com",
    "product_ids": ["produto-a"]
  }'
```

## Rodando com Docker (mesmo fluxo da VM em produção)

Este serviço sobe junto com a Parte 2 no compose compartilhado:

```bash
cd ../processing
docker compose up -d --build
```

## Testes

```bash
npm test
```

Cobertura: `WatermarkService` (marca d'água aplicada, páginas preservadas,
PDF gerado é válido), `LocalFileEbookAssetSource` (carrega por product_id,
erro tratado se não encontrado), `DeliveryService` (envio via Resend, retry
em falha transitória, erro tratado ao esgotar tentativas),
`WatermarkOrchestratorService` (fluxo completo com mocks, nunca escreve em
disco) e `WatermarkJobsController` (payload válido/inválido, 422 se e-book
não existe).

## Escopo desta etapa (BACKLOG.md > Parte 3)

- [x] `WatermarkService`: barra cinza topo/rodapé + texto branco centralizado
      + marca diagonal discreta
- [x] `EbookAssetSource`: carrega PDF original por `product_id` (volume
      Docker local hoje; interface pronta para trocar por R2/S3)
- [x] Geração do PDF **em memória**, nunca persistida em disco (LGPD/US09)
- [x] `DeliveryService`: envio via Resend com anexo, retry em falha
      transitória (US10)
- [x] Log de sucesso/falha do envio sem CPF (US11)
- [x] Healthcheck `/health` para o UptimeRobot

## Decisão de integração com a Parte 2 (fechada)

Ficou confirmado o serviço separado: os dois serviços rodam como
containers Docker distintos na mesma VM (`docker-compose.yml`
compartilhado, `watermark-email` na porta 3001), e a Parte 2 entrega o job
via `POST /watermark-jobs` (contrato de entrada HTTP exposto aqui).

Do lado da Parte 2, `HttpWatermarkJobDispatcher`
(`nestjs-worker/processing/src/order/watermark-job.dispatcher.ts`) é o
provider default de `WatermarkJobDispatcher` em produção, com retry em
erros de rede/5xx. Nada nesta pasta precisou mudar para fechar a
integração — o contrato `WatermarkJob`/`WatermarkJobSchema` seguiu
inalterado.

## O que NÃO está nesta etapa

Recepção do webhook (Parte 1) e consumo da fila/montagem do `WatermarkJob`
(Parte 2) são responsabilidade das etapas anteriores. Esta etapa começa
recebendo um `WatermarkJob` válido.
