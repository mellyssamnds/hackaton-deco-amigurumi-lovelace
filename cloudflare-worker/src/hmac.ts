/**
 * Verifica a assinatura HMAC-SHA256 enviada pela Nuvemshop sobre o corpo bruto (raw) do webhook.
 *
 * ASSUNÇÃO A CONFIRMAR: encoding da assinatura como hexadecimal. Ajustar para base64
 * (via `bufferToBase64`) se a documentação oficial da Nuvemshop especificar outro formato.
 */
export async function verifyHmacSignature(
  rawBody: string,
  signatureHeaderValue: string | null,
  secret: string,
): Promise<boolean> {
  if (!signatureHeaderValue || !secret) {
    return false;
  }

  try {
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const signatureBytes = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
    const expectedHex = bufferToHex(signatureBytes);
    return timingSafeEqual(expectedHex, signatureHeaderValue.trim().toLowerCase());
  } catch {
    // Qualquer falha ao computar a assinatura (ex.: secret ausente/corrompido) é tratada
    // como assinatura inválida — falha fechada (fail closed).
    return false;
  }
}

function bufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Comparação em tempo constante para evitar timing attacks. Sempre percorre o
 * comprimento do valor esperado, mesmo quando os tamanhos diferem.
 */
function timingSafeEqual(expected: string, received: string): boolean {
  const expectedBytes = new TextEncoder().encode(expected);
  const receivedBytes = new TextEncoder().encode(received);

  let mismatch = expectedBytes.length === receivedBytes.length ? 0 : 1;
  const length = expectedBytes.length;

  for (let i = 0; i < length; i++) {
    const receivedByte = i < receivedBytes.length ? receivedBytes[i]! : 0;
    mismatch |= expectedBytes[i]! ^ receivedByte;
  }

  return mismatch === 0;
}
