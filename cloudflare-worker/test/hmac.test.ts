import { describe, expect, it } from "vitest";
import { verifyHmacSignature } from "../src/hmac";

const SECRET = "test-secret";
const BODY = JSON.stringify({ store_id: 1, event: "order/paid", id: 42 });

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

describe("verifyHmacSignature", () => {
  it("accepts a correctly signed body", async () => {
    const signature = await signHex(BODY, SECRET);
    await expect(verifyHmacSignature(BODY, signature, SECRET)).resolves.toBe(true);
  });

  it("accepts a signature regardless of header casing", async () => {
    const signature = await signHex(BODY, SECRET);
    await expect(verifyHmacSignature(BODY, signature.toUpperCase(), SECRET)).resolves.toBe(true);
  });

  it("rejects a signature computed with the wrong secret", async () => {
    const signature = await signHex(BODY, "wrong-secret");
    await expect(verifyHmacSignature(BODY, signature, SECRET)).resolves.toBe(false);
  });

  it("rejects a signature computed over a different body", async () => {
    const signature = await signHex(BODY, SECRET);
    await expect(verifyHmacSignature(BODY + "tampered", signature, SECRET)).resolves.toBe(false);
  });

  it("rejects when the header is missing", async () => {
    await expect(verifyHmacSignature(BODY, null, SECRET)).resolves.toBe(false);
  });

  it("rejects when the secret is empty", async () => {
    const signature = await signHex(BODY, SECRET);
    await expect(verifyHmacSignature(BODY, signature, "")).resolves.toBe(false);
  });

  it("rejects a signature of different length without throwing", async () => {
    await expect(verifyHmacSignature(BODY, "abc", SECRET)).resolves.toBe(false);
  });
});
