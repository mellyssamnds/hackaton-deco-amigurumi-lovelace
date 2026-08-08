import { describe, expect, it, vi } from "vitest";
import worker from "../src/index";
import type { Env, QueueMessage } from "../src/types";

const SECRET = "test-secret";
const SIGNATURE_HEADER = "x-linkedstore-hmac-sha256";
const noopContext = {} as ExecutionContext;

async function signHex(body: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function createEnv(
  overrides: {
    kvStore?: Map<string, string>;
    queueSend?: (message: QueueMessage) => Promise<void>;
  } = {},
): Env {
  const kvStore = overrides.kvStore ?? new Map<string, string>();
  const queueSend = overrides.queueSend ?? vi.fn(async (_message: QueueMessage) => {});

  return {
    ORDERS_QUEUE: { send: queueSend } as unknown as Env["ORDERS_QUEUE"],
    IDEMPOTENCY_KV: {
      get: async (key: string) => kvStore.get(key) ?? null,
      put: async (key: string, value: string) => {
        kvStore.set(key, value);
      },
    } as unknown as Env["IDEMPOTENCY_KV"],
    WEBHOOK_SIGNATURE_HEADER: SIGNATURE_HEADER,
    IDEMPOTENCY_TTL_SECONDS: "2592000",
    WEBHOOK_SIGNING_SECRET: SECRET,
  };
}

async function buildRequest(
  bodyObj: unknown,
  opts: { sign?: boolean; secret?: string } = {},
): Promise<Request> {
  const body = JSON.stringify(bodyObj);
  const headers = new Headers({ "content-type": "application/json" });
  if (opts.sign !== false) {
    headers.set(SIGNATURE_HEADER, await signHex(body, opts.secret ?? SECRET));
  }
  return new Request("https://worker.example/webhooks/nuvemshop", {
    method: "POST",
    headers,
    body,
  });
}

describe("POST /webhooks/nuvemshop", () => {
  it("returns 404 for other paths", async () => {
    const res = await worker.fetch(new Request("https://worker.example/other"), createEnv(), noopContext);
    expect(res.status).toBe(404);
  });

  it("returns 405 for non-POST", async () => {
    const res = await worker.fetch(
      new Request("https://worker.example/webhooks/nuvemshop"),
      createEnv(),
      noopContext,
    );
    expect(res.status).toBe(405);
  });

  it("returns 401 for invalid signature", async () => {
    const req = await buildRequest({ store_id: 1, event: "order/paid", id: 42 }, { secret: "wrong" });
    const res = await worker.fetch(req, createEnv(), noopContext);
    expect(res.status).toBe(401);
  });

  it("returns 400 for malformed json with a valid signature", async () => {
    const body = "{not-json";
    const headers = new Headers();
    headers.set(SIGNATURE_HEADER, await signHex(body, SECRET));
    const req = new Request("https://worker.example/webhooks/nuvemshop", { method: "POST", headers, body });
    const res = await worker.fetch(req, createEnv(), noopContext);
    expect(res.status).toBe(400);
  });

  it("returns 400 for a payload missing required fields", async () => {
    const req = await buildRequest({ event: "order/paid" });
    const res = await worker.fetch(req, createEnv(), noopContext);
    expect(res.status).toBe(400);
  });

  it("returns 200 without publishing when the event is not order/paid", async () => {
    const queueSend = vi.fn(async (_message: QueueMessage) => {});
    const env = createEnv({ queueSend });
    const req = await buildRequest({ store_id: 1, event: "order/created", id: 42 });
    const res = await worker.fetch(req, env, noopContext);
    expect(res.status).toBe(200);
    expect(queueSend).not.toHaveBeenCalled();
  });

  it("publishes to the queue and marks idempotency on first delivery", async () => {
    const kvStore = new Map<string, string>();
    const queueSend = vi.fn(async (_message: QueueMessage) => {});
    const env = createEnv({ kvStore, queueSend });
    const req = await buildRequest({ store_id: 1, event: "order/paid", id: 42 });
    const res = await worker.fetch(req, env, noopContext);

    expect(res.status).toBe(200);
    expect(queueSend).toHaveBeenCalledTimes(1);
    const [message] = queueSend.mock.calls[0] as [QueueMessage];
    expect(message.order_id).toBe("42");
    expect(message.store_id).toBe("1");
    expect(() => new Date(message.received_at).toISOString()).not.toThrow();
    expect(kvStore.get("order:1:42")).toBe(message.received_at);
  });

  it("does not republish when the order was already processed (idempotency)", async () => {
    const kvStore = new Map<string, string>([["order:1:42", "2026-01-01T00:00:00.000Z"]]);
    const queueSend = vi.fn(async (_message: QueueMessage) => {});
    const env = createEnv({ kvStore, queueSend });
    const req = await buildRequest({ store_id: 1, event: "order/paid", id: 42 });
    const res = await worker.fetch(req, env, noopContext);

    expect(res.status).toBe(200);
    expect(queueSend).not.toHaveBeenCalled();
  });

  it("returns 502 when the queue publish fails", async () => {
    const queueSend = vi.fn(async () => {
      throw new Error("queue unavailable");
    });
    const env = createEnv({ queueSend });
    const req = await buildRequest({ store_id: 1, event: "order/paid", id: 42 });
    const res = await worker.fetch(req, env, noopContext);
    expect(res.status).toBe(502);
  });
});
