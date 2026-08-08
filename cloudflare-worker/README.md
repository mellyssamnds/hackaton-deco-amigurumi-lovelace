# cloudflare-worker

Recebe o webhook `order/paid` da Nuvemshop, valida assinatura e payload, evita
reprocessar o mesmo pedido e publica na fila `beatriz-orders` para a próxima etapa
(`nestjs-worker/processing`).

Este worker não faz nenhum processamento pesado: só recepção, validação e repasse.

## Contrato de saída (fixo)

Mensagem publicada na fila `beatriz-orders`:

```ts
type QueueMessage = {
  order_id: string;
  store_id: string;
  received_at: string; // ISO 8601
};
```

Qualquer mudança neste formato precisa ser combinada com o time antes de alterar
`src/types.ts`.

## Setup manual necessário antes do deploy

1. **Criar o namespace KV de idempotência** e colar o ID em `wrangler.toml`:
   ```sh
   npx wrangler kv namespace create IDEMPOTENCY_KV
   ```
   Substitua `REPLACE_WITH_KV_NAMESPACE_ID` em `wrangler.toml` pelo ID retornado.

2. **Criar a fila** (se ainda não existir):
   ```sh
   npx wrangler queues create beatriz-orders
   ```

3. **Definir o secret de assinatura HMAC** (nunca commitar o valor):
   ```sh
   npx wrangler secret put WEBHOOK_SIGNING_SECRET
   ```
   Para desenvolvimento local, copie `.dev.vars.example` para `.dev.vars` e preencha
   o valor real (arquivo já ignorado pelo git).

4. **Confirmar dois pontos pendentes contra a documentação oficial da Nuvemshop**
   (marcados como `PLACEHOLDER`/`TODO` no código) antes do primeiro deploy real:
   - `src/order-envelope.schema.ts`: formato exato do envelope do webhook
     (nomes de campo — assumido `store_id`, `event`, `id`).
   - `wrangler.toml` (`WEBHOOK_SIGNATURE_HEADER`) e `src/hmac.ts`: nome do header
     de assinatura e encoding (assumido `x-linkedstore-hmac-sha256` em hex).

## Custo

Toda a infraestrutura usada (Workers, Queues, KV) opera dentro do Workers Free
plan nos limites atuais (Queues: 10.000 operações/dia, retenção de mensagem de
24h; KV: 100.000 leituras/dia, 1.000 escritas/dia, 1 GB de storage). Não é
necessário upgrade para Workers Paid neste desenho.

## Deploy

Sem CI/CD por enquanto — deploy manual:

```sh
npm install
npm run deploy
```

## Comandos

```sh
npm run dev        # servidor local (wrangler dev)
npm run typecheck  # tsc --noEmit
npm test           # vitest
```
