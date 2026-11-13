import { describe, expect, it } from "vitest";
import { isForThePlayer } from "../api/http";
import { DemoServer } from "../demo/DemoServer";
import { fittedSize, MAX_SIDE, nameFromFile, sniffImage } from "./spriteUpload";

const bytes = (...values: number[]) => new Uint8Array([...values, ...new Array(16).fill(0)]);

describe("preparing a picture in the browser", () => {
  it("knows the format by the first bytes, not by the name", () => {
    expect(sniffImage(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe("png");
    expect(sniffImage(bytes(0xff, 0xd8, 0xff))).toBe("jpeg");
    expect(sniffImage(bytes(0x47, 0x49, 0x46, 0x38))).toBe("gif");
    expect(sniffImage(bytes(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50))).toBe("webp");
    expect(sniffImage(new TextEncoder().encode("<svg onload=alert(1)>"))).toBeNull();
    expect(sniffImage(bytes(0x4d, 0x5a))).toBeNull(); // an .exe renamed to .png
  });

  it("shrinks big pictures to sprite size and grows tiny ones in whole pixels", () => {
    expect(fittedSize(1024, 512)).toEqual({ width: MAX_SIDE, height: 64, smooth: true });
    expect(fittedSize(64, 48)).toEqual({ width: 64, height: 48, smooth: false });
    expect(fittedSize(8, 8)).toEqual({ width: 16, height: 16, smooth: false });
  });

  it("suggests a name from the file name", () => {
    expect(nameFromFile("mi_dragon-final.png")).toBe("mi dragon final");
    expect(nameFromFile(".png")).toBe("Mi imagen");
    expect(nameFromFile(`${"x".repeat(40)}.png`)).toHaveLength(24);
  });

  it("shows the server's own Spanish reasons, not technical English ones", () => {
    expect(isForThePlayer("El archivo esconde datos después de la imagen")).toBe(true);
    expect(isForThePlayer("Unknown template")).toBe(false);
    expect(isForThePlayer("")).toBe(false);
  });
});

describe("pictures in the demo", () => {
  const memory = (): Storage => {
    const data = new Map<string, string>();
    return { get length() { return data.size; }, clear: () => data.clear(), getItem: (k) => data.get(k) ?? null, key: () => null, removeItem: (k) => void data.delete(k), setItem: (k, v) => void data.set(k, v) };
  };
  const png = btoa(String.fromCharCode(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3));
  const rebuild = async () => ({ dataUrl: "data:image/png;base64,AAAA", width: 24, height: 24 });

  it("checks, rebuilds, links and deletes pictures without leaving the browser", async () => {
    const server = new DemoServer(memory(), rebuild);
    const sprite = (await server.handle("/me/sprites", "POST", { name: "Dragón", data: png })) as { id: number; checks: string[]; data_url: string };
    expect(sprite.data_url).toBe("data:image/png;base64,AAAA");
    expect(sprite.checks).toContain("rebuilt");
    await expect(server.handle("/me/sprites", "POST", { name: "x", data: btoa("<script>") })).rejects.toMatchObject({ status: 422 });
    const creation = (await server.handle("/me/creations", "POST", { category: "enemy", base_kind: "enemy", name: "Dragón", tint: "#ffffff", health: 3, damage: 1, speed: 70, sprite_id: sprite.id })) as { sprite_id: number };
    expect(creation.sprite_id).toBe(sprite.id);
    await expect(server.handle("/me/creations", "POST", { category: "enemy", base_kind: "enemy", name: "X", tint: "#ffffff", health: 3, damage: 1, speed: 70, sprite_id: 999 })).rejects.toMatchObject({ status: 422 });
    await server.handle(`/me/sprites/${sprite.id}`, "DELETE", undefined);
    expect(((await server.handle("/me/creations", "GET", undefined)) as { sprite_id: number | null }[])[0].sprite_id).toBeNull();
  });
});
