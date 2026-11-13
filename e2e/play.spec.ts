import { expect, test } from "@playwright/test";
import { createProject, newUser, register, screenPoint } from "./helpers";

test("a run is played with physics, finished and learned from", async ({ page }) => {
  await register(page, newUser());
  await createProject(page, "Partida");
  await page.getByRole("button", { name: /^Jugador/ }).click();
  const point = await screenPoint(page, 96, 480);
  await page.mouse.click(point.x, point.y);

  await page.getByRole("button", { name: "Jugar" }).click();
  // Before every run the player picks a hero; each one has its own health and weapon.
  const heroes = page.locator("#hero-dialog");
  await expect(heroes).toBeVisible();
  await expect(heroes.locator(".hero")).toHaveCount(11);
  await heroes.locator('.hero[data-hero="wizard"]').click();
  await expect(heroes.locator('.hero[data-hero="wizard"]')).toHaveAttribute("aria-checked", "true");
  await page.getByRole("button", { name: "Jugar con este héroe ›" }).click();
  await expect(page.locator("#hud")).toBeVisible();
  await expect(page.locator(".dock-left")).toBeHidden();
  await expect(page.locator("#hud-hero")).toHaveText("Mago");
  await expect(page.locator("#hud-life-text")).toHaveText("4/4");
  await expect(page.locator("#hud-weapon")).toHaveAttribute("src", /wand\.png$/);

  // Walk for a while: time passes and the camera follows the player.
  await page.keyboard.down("ArrowRight");
  await page.waitForTimeout(1500);
  await page.keyboard.up("ArrowRight");
  await page.keyboard.press("Space"); // the wand's lightning
  await page.keyboard.press("Shift"); // dash
  await expect(page.locator("#hud-time")).not.toHaveText("0:00");

  await page.getByRole("button", { name: "Detener" }).click();
  const dialog = page.locator("#result-dialog");
  await expect(dialog).toBeVisible();
  await expect(page.locator("#result-title")).toHaveText(/Partida abandonada|Has perdido|¡Nivel superado!/);
  await expect(dialog).toContainText("La IA aprendió de esta partida");

  await page.getByRole("button", { name: "Volver al editor" }).click();
  await expect(page.locator("#hud")).toBeHidden();
  await expect(page.locator("#stats")).toContainText("1Partidas");
  await expect(page.locator("#ai-model")).toContainText("Aprendió de 1 partida");
});
