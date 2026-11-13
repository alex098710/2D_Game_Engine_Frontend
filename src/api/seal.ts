/**
 * Sealed account requests: the body travels as one encrypted block, inside HTTPS.
 *
 * HTTPS protects the data on the way; sealing also keeps the email, the password and the
 * session tokens out of the browser's own tools (the network tab, saved HAR files, extensions
 * that read requests). They only see { "sealed": "v1.…" }.
 *
 * 1. GET /auth/challenge gives a one-time id and the server's RSA public key.
 * 2. A random AES-256-GCM key encrypts the JSON body (the id is bound as associated data) and
 *    RSA-OAEP-SHA256 wraps that key, so only the server can open it.
 * 3. The server burns the id: a copied block cannot be sent again.
 * 4. Its answer (the tokens) comes back encrypted with the same AES key, which never leaves
 *    this function: nothing else on the page, or in the network tab, can read it.
 *
 * Uses the browser's own Web Crypto API; nothing is written to the console.
 */

export interface Challenge {
  id: string;
  key: string; // SubjectPublicKeyInfo, base64url
}

export interface Sealed {
  /** The body to send: {"sealed": "v1.<id>.<wrapped key>.<iv>.<ciphertext>"}. */
  body: string;
  /** Opens the server's sealed answer (only this request's key can). */
  open<T>(answer: unknown): Promise<T>;
}

const RESPONSE_AAD = new TextEncoder().encode("pixelforge-response");

export function sealingAvailable(): boolean {
  return typeof crypto !== "undefined" && typeof crypto.subtle?.encrypt === "function";
}

export function toBase64Url(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let text = "";
  for (const byte of view) text += String.fromCharCode(byte);
  return btoa(text).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  const plain = atob(text.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (text.length % 4)) % 4));
  const bytes = new Uint8Array(plain.length);
  for (let i = 0; i < plain.length; i++) bytes[i] = plain.charCodeAt(i);
  return bytes;
}

/** Encrypt `payload` for the server that handed out `challenge`. */
export async function seal(payload: unknown, challenge: Challenge): Promise<Sealed> {
  const subtle = crypto.subtle;
  const publicKey = await subtle.importKey("spki", fromBase64Url(challenge.key), { name: "RSA-OAEP", hash: "SHA-256" }, false, ["encrypt"]);
  const aesKey = await subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
  const raw = await subtle.exportKey("raw", aesKey);
  const wrapped = await subtle.encrypt({ name: "RSA-OAEP" }, publicKey, raw);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plain = new TextEncoder().encode(JSON.stringify(payload));
  const ciphertext = await subtle.encrypt({ name: "AES-GCM", iv, additionalData: new TextEncoder().encode(challenge.id) }, aesKey, plain);
  const block = ["v1", challenge.id, toBase64Url(wrapped), toBase64Url(iv), toBase64Url(ciphertext)].join(".");
  return {
    body: JSON.stringify({ sealed: block }),
    async open<T>(answer: unknown): Promise<T> {
      const sealed = (answer as { sealed?: unknown } | null)?.sealed;
      if (typeof sealed !== "string") return answer as T; // a plain answer (no body to protect)
      const [ivText, dataText] = sealed.split(".");
      const opened = await subtle.decrypt({ name: "AES-GCM", iv: fromBase64Url(ivText), additionalData: RESPONSE_AAD }, aesKey, fromBase64Url(dataText));
      return JSON.parse(new TextDecoder().decode(opened)) as T;
    },
  };
}
