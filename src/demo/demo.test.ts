import { afterEach, describe, expect, it, vi } from "vitest";
import { HttpClient } from "../api/http";
import { TokenStore } from "../api/tokens";
import { DemoServer, DEMO_USER } from "./DemoServer";
import { generate, MAX_TOTAL, parseEdit } from "./demoAi";

/** sessionStorage stand-in. */
function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() { return data.size; },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => void data.delete(key),
    setItem: (key, value) => void data.set(key, value),
  };
}

const json = (value: unknown) => JSON.stringify(value);

describe("demo: nothing reaches the network", () => {
  it("answers every request in the browser while the demo is on", async () => {
    const fetcher = vi.fn();
    const client = new HttpClient("https://api.example", new TokenStore(), fetcher);
    client.useDemo(new DemoServer(memoryStorage()));
    await client.request("/auth/me");
    await client.request("/projects", { method: "POST", body: json({ name: "Prueba" }) });
    await client.request("/me/stats");
    await client.sealedRequest("/auth/login", { email: "a@b.c", password: "x" }).catch(() => undefined);
    await expect(client.refreshTokens()).resolves.toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("goes back to the network when the demo ends", async () => {
    const fetcher = vi.fn(async () => new Response(json({ ok: true }), { status: 200 }));
    const client = new HttpClient("https://api.example", new TokenStore(), fetcher);
    client.useDemo(new DemoServer(memoryStorage()));
    client.useDemo(null);
    await client.request("/health");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

describe("demo server", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("is the guest, and refuses account actions", async () => {
    const server = new DemoServer(memoryStorage());
    expect(await server.handle("/auth/me", "GET", undefined)).toEqual(DEMO_USER);
    await expect(server.handle("/auth/password", "POST", {})).rejects.toMatchObject({ status: 403 });
    await expect(server.handle("/auth/login", "POST", {})).rejects.toMatchObject({ status: 403 });
    await expect(server.handle("/auth/register", "POST", {})).rejects.toMatchObject({ status: 403 });
  });

  it("creates, saves, versions and deletes projects with the server's limits", async () => {
    const server = new DemoServer(memoryStorage());
    const project = (await server.handle("/projects", "POST", { name: "  Mi   nivel " })) as { id: number; name: string };
    expect(project.name).toBe("Mi nivel");
    await expect(server.handle("/projects", "POST", { name: "x".repeat(31) })).rejects.toMatchObject({ status: 422 });
    await server.handle(`/projects/${project.id}/scene`, "PUT", { scene: [{ id: "a", kind: "tree", x: 10, y: 10 }] });
    await expect(server.handle(`/projects/${project.id}/scene`, "PUT", { scene: [{ id: "b", kind: "nope", x: 1, y: 1 }] }))
      .rejects.toMatchObject({ status: 422 });
    const tooMany = Array.from({ length: 1501 }, (_, i) => ({ id: `t${i}`, kind: "tree", x: 1, y: 1 }));
    await expect(server.handle(`/projects/${project.id}/scene`, "PUT", { scene: tooMany })).rejects.toMatchObject({ status: 422 });
    const versions = (await server.handle(`/projects/${project.id}/versions`, "GET", undefined)) as unknown[];
    expect(versions).toHaveLength(1);
    await server.handle(`/projects/${project.id}`, "DELETE", undefined);
    await expect(server.handle(`/projects/${project.id}`, "GET", undefined)).rejects.toMatchObject({ status: 404 });
  });

  it("creates a project from a ready-made map", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(json([{ code: "village", name: "Aldea", description: "", object_count: 1, scene: [{ id: "h", kind: "house", x: 50, y: 50 }] }]))));
    const server = new DemoServer(memoryStorage());
    const project = (await server.handle("/projects", "POST", { name: "Aldea", template: "village" })) as { scene: unknown[] };
    expect(project.scene).toHaveLength(1);
    await expect(server.handle("/projects", "POST", { name: "X", template: "nope" })).rejects.toMatchObject({ status: 422 });
  });

  it("lets the AI remove and add objects", async () => {
    const server = new DemoServer(memoryStorage());
    const { id } = (await server.handle("/projects", "POST", { name: "IA" })) as { id: number };
    await server.handle(`/projects/${id}/scene`, "PUT", { scene: [{ id: "s", kind: "enemy", x: 100, y: 100 }, { id: "p", kind: "player", x: 50, y: 50 }] });
    const answer = (await server.handle(`/projects/${id}/ai`, "POST", { prompt: "borra los enemigos y pon 3 monedas" })) as { scene: { kind: string }[]; ai: { added: number; removed: number } };
    expect(answer.ai).toEqual({ added: 3, removed: 1 });
    expect(answer.scene.filter((object) => object.kind === "coin")).toHaveLength(3);
    expect(answer.scene.some((object) => object.kind === "player")).toBe(true);
  });

  it("records runs, unlocks achievements and learns", async () => {
    const server = new DemoServer(memoryStorage());
    const { id } = (await server.handle("/projects", "POST", { name: "Jugar" })) as { id: number };
    const run = (await server.handle(`/projects/${id}/plays`, "POST", undefined)) as { id: number };
    const result = { outcome: "won", score: 50, coins_collected: 2, coins_total: 2, enemies_defeated: 1, damage_taken: 0, deaths: 0, duration_ms: 1000, events: [] };
    const finish = (await server.handle(`/projects/${id}/plays/${run.id}/finish`, "POST", result)) as { achievements: string[]; difficulty: number };
    expect(finish.achievements).toEqual(expect.arrayContaining(["first-coin", "coin-hoarder", "first-win", "untouchable"]));
    expect(finish.difficulty).toBeGreaterThan(0.5);
    await expect(server.handle(`/projects/${id}/plays/${run.id}/finish`, "POST", result)).rejects.toMatchObject({ status: 404 });
    expect(((await server.handle("/me/stats", "GET", undefined)) as { games_played: number }).games_played).toBe(1);
  });

  it("checks the admin panel's numbers like the server", async () => {
    const server = new DemoServer(memoryStorage());
    await server.handle("/me/balance", "PUT", { heroes: { knight: { health: 8, damage: 2 } }, enemies: {} });
    await expect(server.handle("/me/balance", "PUT", { heroes: { knight: { health: 99, damage: 2 } }, enemies: {} })).rejects.toMatchObject({ status: 422 });
    await expect(server.handle("/me/creations", "POST", { category: "enemy", base_kind: "enemy", name: "", tint: "#ffffff", health: 3, damage: 1, speed: 70 }))
      .rejects.toMatchObject({ status: 422 });
    const creation = (await server.handle("/me/creations", "POST", { category: "enemy", base_kind: "enemy", name: "Ogro de hielo", tint: "#3FA9FF", health: 3, damage: 1, speed: 70 })) as { tint: string };
    expect(creation.tint).toBe("#3fa9ff");
  });

  it("keeps its data in this tab only, and erases it on leaving", async () => {
    const storage = memoryStorage();
    const server = new DemoServer(storage);
    await server.handle("/projects", "POST", { name: "Guardado" });
    expect(DemoServer.saved(storage)).toBe(true);
    expect(((await new DemoServer(storage).handle("/projects", "GET", undefined)) as unknown[])).toHaveLength(1);
    server.wipe();
    expect(DemoServer.saved(storage)).toBe(false);
  });
});

describe("demo AI", () => {
  it("adds what the request names, never a player, never more than the limit", () => {
    const objects = generate("3 monedas y una pared en 400 300");
    expect(objects.filter((object) => object.kind === "coin")).toHaveLength(3);
    expect(objects.find((object) => object.kind === "wall")).toMatchObject({ x: 400, y: 300 });
    expect(generate("10 árboles, 10 casas, 10 monedas, 10 tanques").length).toBeLessThanOrEqual(MAX_TOTAL);
    expect(generate("un jugador").some((object) => object.kind === "player")).toBe(false);
  });

  it("splits removals from additions", () => {
    const edit = parseEdit("Elimina todo y pon 5 tanques");
    expect(edit.removeKinds.has("tree")).toBe(true);
    expect(edit.removeKinds.has("player")).toBe(false);
    expect(edit.addRequest).toContain("5 tanques");
    expect(parseEdit("pon 3 monedas").removeKinds.size).toBe(0);
  });
});
