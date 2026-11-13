import { expect, test } from "vitest";
import { ApiError, friendlyMessage, HttpClient } from "./http";
import { TokenStore } from "./tokens";

type Handler = (url: string, init: RequestInit) => Response | Promise<Response>;

function json(status: number, body: unknown): Response {
  return new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function setup(handler: Handler, withTokens = true) {
  const calls: { url: string; auth: string | undefined; body: unknown }[] = [];
  const tokens = new TokenStore(null);
  if (withTokens) tokens.save({ access_token: "old-access", refresh_token: "old-refresh", token_type: "bearer", expires_in: 900 });
  const fetcher = (async (input: string, init: RequestInit) => {
    const headers = init.headers as Record<string, string>;
    calls.push({ url: input, auth: headers["Authorization"], body: init.body ? JSON.parse(String(init.body)) : undefined });
    return handler(input, init);
  }) as unknown as typeof fetch;
  return { client: new HttpClient("https://api.test", tokens, fetcher), calls, tokens };
}

test("HttpClient sends the access token as a bearer header", async () => {
  const { client, calls } = setup(() => json(200, { ok: true }));
  expect(await client.request("/auth/me")).toEqual({ ok: true });
  expect(calls[0]).toMatchObject({ url: "https://api.test/auth/me", auth: "Bearer old-access" });
});

test("HttpClient sends no header without tokens", async () => {
  const { client, calls } = setup(() => json(200, {}), false);
  await client.request("/health");
  expect(calls[0].auth).toBeUndefined();
});

test("HttpClient refreshes on 401 and retries with the new token", async () => {
  const { client, calls, tokens } = setup((url, init) => {
    if (url.endsWith("/auth/refresh")) {
      return json(200, { access_token: "new-access", refresh_token: "new-refresh", token_type: "bearer", expires_in: 900 });
    }
    const auth = (init.headers as Record<string, string>)["Authorization"];
    return auth === "Bearer new-access" ? json(200, { id: 1 }) : json(401, { detail: "Invalid or missing token" });
  });
  expect(await client.request("/projects")).toEqual({ id: 1 });
  // The refresh first asks for a seal challenge; this fake server has none, so it goes plain.
  const real = calls.filter((c) => !c.url.endsWith("/auth/challenge"));
  expect(real.map((c) => c.url)).toEqual(["https://api.test/projects", "https://api.test/auth/refresh", "https://api.test/projects"]);
  expect(real[1].body).toEqual({ refresh_token: "old-refresh" });
  expect(tokens.refresh).toBe("new-refresh");
});

test("HttpClient runs a single refresh for parallel requests", async () => {
  let refreshes = 0;
  const { client } = setup((url, init) => {
    if (url.endsWith("/auth/refresh")) {
      refreshes += 1;
      return json(200, { access_token: "new-access", refresh_token: "r2", token_type: "bearer", expires_in: 900 });
    }
    const auth = (init.headers as Record<string, string>)["Authorization"];
    return auth === "Bearer new-access" ? json(200, {}) : json(401, {});
  });
  await Promise.all([client.request("/a"), client.request("/b"), client.request("/c")]);
  expect(refreshes).toBe(1);
});

test("HttpClient clears the tokens and reports a lost session when refresh fails", async () => {
  let lost = false;
  const { client, tokens } = setup((url) => (url.endsWith("/auth/refresh") ? json(401, {}) : json(401, { detail: "Invalid or missing token" })));
  client.whenSessionLost(() => (lost = true));
  await expect(client.request("/projects")).rejects.toBeInstanceOf(ApiError);
  expect(lost).toBe(true);
  expect(tokens.refresh).toBeNull();
});

test("HttpClient refreshes before a request when the access token is about to expire", async () => {
  const { client, calls, tokens } = setup((url) =>
    url.endsWith("/auth/refresh")
      ? json(200, { access_token: "fresh", refresh_token: "r2", token_type: "bearer", expires_in: 900 })
      : json(200, {}),
  );
  tokens.save({ access_token: "stale", refresh_token: "r1", token_type: "bearer", expires_in: 5 });
  await client.request("/projects");
  const real = calls.filter((c) => !c.url.endsWith("/auth/challenge"));
  expect(real.map((c) => c.url.split("/").pop())).toEqual(["refresh", "projects"]);
  expect(real[1].auth).toBe("Bearer fresh");
});

test("HttpClient turns backend errors into Spanish messages", async () => {
  const { client } = setup(() => json(409, { detail: "Email already registered" }), false);
  await expect(client.request("/auth/register")).rejects.toMatchObject({ status: 409, message: "Ese correo ya tiene una cuenta." });
});

test("HttpClient reports network failures and returns nothing for 204", async () => {
  const offline = setup(() => {
    throw new TypeError("offline");
  }, false);
  await expect(offline.client.request("/health")).rejects.toMatchObject({ status: 0 });
  const empty = setup(() => json(204, null));
  expect(await empty.client.request("/auth/logout")).toBeUndefined();
});

test("friendlyMessage covers validation and AI errors", () => {
  expect(friendlyMessage(422, "whatever")).toBe("Hay datos no válidos en el formulario.");
  expect(friendlyMessage(502, "x")).toBe("La IA no respondió. Inténtalo de nuevo.");
  expect(friendlyMessage(418, "teapot")).toBe("Algo salió mal (código 418). Inténtalo de nuevo.");
  expect(friendlyMessage(429, "anything")).toBe("Demasiadas peticiones. Espera un momento.");
});

test("HttpClient reads the login attempts left from the response", async () => {
  const { client } = setup(
    () => new Response(JSON.stringify({ detail: "Invalid email or password" }), { status: 401, headers: { "X-Attempts-Remaining": "2" } }),
    false,
  );
  const error = await client.request("/auth/login", { method: "POST" }).catch((e: unknown) => e);
  expect(error).toBeInstanceOf(ApiError);
  expect((error as ApiError).attemptsLeft).toBe(2);
  expect((error as ApiError).message).toBe("Correo o contraseña incorrectos.");
});

test("HttpClient keeps the session when the server is waking up during a refresh", async () => {
  const { client, tokens } = setup((url) => (url.endsWith("/auth/refresh") ? json(503, { detail: "starting" }) : json(401, {})));
  await client.request("/auth/me").catch(() => undefined);
  expect(tokens.refresh).toBe("old-refresh");
});

test("HttpClient forgets the session when the refresh token is rejected", async () => {
  const { client, tokens } = setup(() => json(401, { detail: "revoked" }));
  await client.request("/auth/me").catch(() => undefined);
  expect(tokens.refresh).toBeNull();
});
