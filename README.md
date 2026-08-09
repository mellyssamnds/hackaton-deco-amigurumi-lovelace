# hackaton-deco-amigurumi-lovelace

**Projeto Beatriz** — entrega automática de e-books de amigurumi vendidos na
Nuvemshop: a cada venda, o comprador recebe por e-mail um PDF com marca
d'água (nome + CPF), sem intervenção manual e com custo zero de
infraestrutura.

Projeto do hackathon **[Agents for Commerce](https://hackathon.decocms.com/agents-for-commerce)** (Deco).

O Agents for Commerce é o hackathon da Deco para tirar do papel, em poucos
dias, soluções agênticas que resolvam problemas reais de uma operação de
e-commerce de alto volume. Quem opera uma loja sabe que ela perde dinheiro
em dezenas de pequenos pontos todo dia, em tarefas repetidas que ninguém
tem tempo de fazer direito: search, catalog, performance, tráfego, etc.
Achar e corrigir isso na mão é trabalho de tempo integral. É justamente o
tipo de coisa que um agente faz melhor.

## Como funciona

```
Nuvemshop (order/paid)
        │  webhook
        ▼
cloudflare-worker              valida assinatura HMAC, dedupe via KV,
        │                      publica na fila
        │  Cloudflare Queue "beatriz-orders"
        ▼
nestjs-worker/processing       consome a fila, busca o pedido completo na
        │                      Nuvemshop, extrai nome + CPF do comprador,
        │                      monta o WatermarkJob
        │  HTTP POST /watermark-jobs
        ▼
nestjs-worker/watermark-email  aplica a marca d'água no PDF (pdf-lib, em
                                memória, nunca em disco) e envia por
                                e-mail via Resend
```

Cada seta acima é um contrato fixo entre módulos — mudar o formato de
`QueueMessage` ou `WatermarkJob` exige alinhar com quem mantém o módulo do
outro lado.

```ts
// cloudflare-worker → processing (fila "beatriz-orders")
type QueueMessage = {
  order_id: string;
  store_id: string;
  received_at: string; // ISO 8601
};

// processing → watermark-email (POST /watermark-jobs)
type WatermarkJob = {
  order_id: string;
  buyer_full_name: string;
  buyer_cpf: string;       // formatado, ex: 123.456.789-00
  buyer_email: string;
  product_ids: string[];   // localizam assets/ebooks/{product_id}.pdf
};
```

## Módulos

| Módulo | Responsabilidade | Onde roda |
|---|---|---|
| [`cloudflare-worker`](cloudflare-worker/README.md) | Recebe e valida o webhook `order/paid`, evita reprocessar o mesmo pedido (idempotência via KV), publica na fila | Cloudflare Workers (free plan) |
| [`nestjs-worker/processing`](nestjs-worker/processing/README.md) | Consome a fila (HTTP Pull, polling 5s), busca o pedido completo na API da Nuvemshop, valida com Zod e monta o `WatermarkJob` | Docker, VM |
| [`nestjs-worker/watermark-email`](nestjs-worker/watermark-email/README.md) | Aplica a marca d'água no PDF e envia o e-book por e-mail via Resend | Docker, mesma VM |

Cada módulo tem seu próprio `README.md` com setup, variáveis de ambiente,
escopo detalhado e comandos de teste. Os dois serviços NestJS
(`processing` e `watermark-email`) sobem juntos via
`nestjs-worker/processing/docker-compose.yml`.

## Stack

| Tecnologia | Onde é usada | Papel |
|---|---|---|
| **TypeScript** | Todos os módulos | Linguagem de todo o projeto |
| **Cloudflare Worker** | Parte 1 | Recepção do webhook `order/paid` |
| **NestJS** | Parte 2 e Parte 3 | Processamento e entrega |
| **Zod** | Parte 1, 2 e 3 | Validação em todas as fronteiras de serviço |
| **pdf-lib** | Parte 3 | Marca d'água aplicada em memória (nunca persistida em disco) |
| **Resend** | Parte 3 | Envio de e-mail transacional |
| **Docker Compose** | Parte 2 e 3 | Deploy manual via SSH, sem CI/CD |
| **Vitest** | Parte 1 | Testes |
| **Jest** | Parte 2 e Parte 3 | Testes

## Rodando localmente

```bash
# Parte 1 - Cloudflare Worker
cd cloudflare-worker
npm install && npm run dev

# Partes 2 e 3 - sobem juntas via Docker Compose
cd nestjs-worker/processing
cp .env.example .env                    # preencha CF_* e NUVEMSHOP_*
cp ../watermark-email/.env.example ../watermark-email/.env  # preencha RESEND_API_KEY
docker compose up -d --build
```

`GET http://localhost:3000/health` (processing) e
`GET http://localhost:3001/health` (watermark-email) devem responder
`200 { status: "ok" }`. Detalhes de cada variável de ambiente estão nos
READMEs de módulo.

## Testes

```bash
cd cloudflare-worker && npm test               # Vitest
cd nestjs-worker/processing && npm test         # Jest (26 testes)
cd nestjs-worker/watermark-email && npm test    # Jest
```

## LGPD

O PDF marcado com nome e CPF do comprador é gerado inteiramente em memória
e nunca escrito em disco (`watermark-email/WatermarkService` +
`DeliveryService`) — requisito não-negociável do projeto. Logs de envio
não incluem o CPF do comprador.

## Deploy

Manual, sem CI/CD: SSH na VM + `docker compose up -d --build` para os
serviços NestJS (Partes 2 e 3), e `npm run deploy` (wrangler) para o
Cloudflare Worker (Parte 1). Detalhes de setup (namespace KV, fila,
secrets) em [`cloudflare-worker/README.md`](cloudflare-worker/README.md).

## Custo

Toda a infraestrutura (Cloudflare Workers, Queues, KV) opera dentro dos
limites do Workers Free plan — sem necessidade de upgrade pago. Detalhes em
[`cloudflare-worker/README.md`](cloudflare-worker/README.md#custo).


## Time de desenvolvimento

Projeto desenvolvido durante o **Hackathon Agents for Commerce **, com foco na resolução de problemas reais de uma operação de e-commerce de alto volume utilizando agentes de IA.

| Nome | GitHub |
|------|--------|
| Joyce Silva | [@joycejsm](https://github.com/joycejsm) |
| Meliza Maia | [@melizamaia](https://github.com/melizamaia) |
| Mellyssa Mendes | [@mellyssamnds](https://github.com/mellyssamnds) |
| Yasmine Oenning | [@ysmneonng](https://github.com/ysmneonng) |


## Licença

[MIT](LICENSE)


*Desenvolvido com TypeScript · Hackathon Agents for Commerce (Deco) 2026*

