import { expect, test } from "vitest";
import { fromBase64Url, seal, sealingAvailable, toBase64Url } from "./seal";

const RESPONSE_AAD = new TextEncoder().encode("pixelforge-response");

/** A pretend server: an RSA key pair and a challenge, like GET /auth/challenge. */
async function server() {
  const pair = await crypto.subtle.generateKey(
    { name: "RSA-OAEP", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["encrypt", "decrypt"],
  );
  const spki = await crypto.subtle.exportKey("spki", pair.publicKey);
  return { pair, challenge: { id: "reto-123", key: toBase64Url(spki) } };
}

test("base64url round-trips bytes", () => {
  const bytes = new Uint8Array([0, 1, 250, 251, 252, 253, 254, 255]);
  expect([...fromBase64Url(toBase64Url(bytes))]).toEqual([...bytes]);
});

test("the sealed body hides the password and only the server's key opens it", async () => {
  expect(sealingAvailable()).toBe(true);
  const { pair, challenge } = await server();
  const sealed = await seal({ email: "a@b.co", password: "mi-contrasena-secreta" }, challenge);

  expect(sealed.body).not.toContain("mi-contrasena-secreta");
  expect(sealed.body).not.toContain("a@b.co");
  const [version, id, wrapped, iv, data] = JSON.parse(sealed.body).sealed.split(".");
  expect([version, id]).toEqual(["v1", "reto-123"]);

  // What the backend does: unwrap the AES key with RSA, then decrypt with the id bound.
  const raw = await crypto.subtle.decrypt({ name: "RSA-OAEP" }, pair.privateKey, fromBase64Url(wrapped));
  const aes = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBase64Url(iv), additionalData: new TextEncoder().encode(id) }, aes, fromBase64Url(data));
  expect(JSON.parse(new TextDecoder().decode(plain))).toEqual({ email: "a@b.co", password: "mi-contrasena-secreta" });

  // And its sealed answer opens with the same request's key.
  const answerIv = crypto.getRandomValues(new Uint8Array(12));
  const answer = await crypto.subtle.encrypt({ name: "AES-GCM", iv: answerIv, additionalData: RESPONSE_AAD }, aes, new TextEncoder().encode('{"access_token":"t"}'));
  expect(await sealed.open({ sealed: `${toBase64Url(answerIv)}.${toBase64Url(answer)}` })).toEqual({ access_token: "t" });
});

test("a plain answer (no body) passes through", async () => {
  const { challenge } = await server();
  const sealed = await seal({ x: 1 }, challenge);
  expect(await sealed.open(undefined)).toBeUndefined();
});
