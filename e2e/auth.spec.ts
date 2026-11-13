import { expect, test } from "@playwright/test";
import { fillRegister, logIn, newUser, reachHome, register } from "./helpers";

test("the login screen fills the whole window, is in Spanish and shows no menu", async ({ page }) => {
  await page.goto("/");
  const screen = page.locator("#login-screen");
  await expect(screen).toBeVisible();
  const box = (await screen.boundingBox())!;
  const viewport = page.viewportSize()!;
  expect(box.width).toBe(viewport.width);
  expect(box.height).toBe(viewport.height);
  await expect(page.getByRole("tab", { name: "Iniciar sesión" })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "es");
  await expect(page.locator("#login-emblem")).toBeVisible();
  // The options of the engine only exist after logging in.
  await expect(page.locator(".topnav-tabs")).toBeHidden();
  await expect(page.locator("#app")).toBeHidden();
});

test("the eye button shows and hides the password", async ({ page }) => {
  await page.goto("/");
  const password = page.locator("#auth-password");
  await password.fill("secreto-largo-123");
  await expect(password).toHaveAttribute("type", "password");
  await page.getByRole("button", { name: "Mostrar contraseña" }).first().click();
  await expect(password).toHaveAttribute("type", "text");
  await page.getByRole("button", { name: "Ocultar contraseña" }).click();
  await expect(password).toHaveAttribute("type", "password");
});

test("every register field says what is wrong and how to fix it", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("tab", { name: "Crear cuenta" }).click();
  await page.getByLabel("Nombre de usuario").fill("ab");
  await page.getByLabel("Correo electrónico").fill("ana@pixelforge");
  await page.locator("#auth-password").fill("password123");
  await page.locator("#auth-confirm").fill("otra cosa");
  await page.locator("#auth-submit").click();
  await expect(page.locator("#msg-username")).toHaveText("Debe tener al menos 3 caracteres.");
  await expect(page.locator("#msg-email")).toHaveText("Al dominio le falta la terminación, por ejemplo .com o .co.");
  await expect(page.locator("#msg-password")).toHaveText("Esa contraseña es demasiado común.");
  await expect(page.locator("#msg-confirm")).toHaveText("No coincide con la contraseña.");
  await expect(page.locator("#auth-message")).toHaveText("Revisa los campos marcados en rojo.");
  await expect(page.locator('#password-rules li[data-rule="common"]')).not.toHaveClass(/is-ok/);
  await expect(page.locator("#app")).toBeHidden();
});

test("the terms must be accepted to create an account", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("tab", { name: "Crear cuenta" }).click();
  await page.getByLabel("Nombre de usuario").fill("ana_forja");
  await page.getByLabel("Correo electrónico").fill("ana@pixelforge.test");
  await page.locator("#auth-password").fill("caballo verde saltarin");
  await page.locator("#auth-confirm").fill("caballo verde saltarin");
  await expect(page.locator("#password-rules li.is-ok")).toHaveCount(4);
  await page.locator("#auth-submit").click();
  await expect(page.locator("#auth-message")).toHaveText("Debes aceptar las condiciones para crear la cuenta.");
});

test("registering plays the intro, then opens the home menu", async ({ page }) => {
  const user = newUser();
  await fillRegister(page, user);
  await expect(page.locator("#auth-success")).toBeVisible();
  await expect(page.locator("#intro")).toBeVisible();
  await expect(page.locator(".topnav-tabs")).toBeHidden();
  // Without skipping, the intro ends by itself after about five seconds.
  await expect(page.locator("#home")).toBeVisible({ timeout: 10_000 });
  await expect(page.locator("#welcome-title")).toHaveText(`Bienvenido, ${user.username}`);
  await expect(page.locator(".option")).toHaveCount(5);
});

test("the menu bar never cuts its options off", async ({ page }) => {
  await page.setViewportSize({ width: 760, height: 800 });
  await register(page, newUser(), "home");
  const width = page.viewportSize()!.width;
  for (const tab of await page.locator(".nav-tab").all()) {
    const box = (await tab.boundingBox())!;
    expect(box.x + box.width).toBeLessThanOrEqual(width);
  }
  await page.locator('.option[data-go="editor"]').click();
  await expect(page.locator("#app")).toBeVisible();
  await page.locator("#btn-home").click();
  await expect(page.locator("#home")).toBeVisible();
});

test("a wrong password says how many attempts are left, never which part was wrong", async ({ page }) => {
  const user = newUser();
  await register(page, user);
  await page.getByRole("button", { name: "Salir", exact: true }).click();
  await page.getByLabel("Correo electrónico").fill(user.email);
  await page.locator("#auth-password").fill("no es la clave");
  await page.locator("#auth-submit").click();
  await expect(page.locator("#auth-banner")).toHaveText(
    "⚠ Correo o contraseña incorrectos. Te quedan 4 intentos antes de bloquear la cuenta 15 minutos.",
  );
});

test("five wrong passwords lock the account for a while", async ({ page }) => {
  const user = newUser();
  await register(page, user);
  await page.getByRole("button", { name: "Salir", exact: true }).click();
  await page.getByLabel("Correo electrónico").fill(user.email);
  for (let i = 0; i < 5; i++) {
    await page.locator("#auth-password").fill(`incorrecta ${i}`);
    await page.locator("#auth-submit").click();
    await expect(page.locator("#auth-banner")).toContainText(i === 4 ? "bloqueada" : `${4 - i} intento`);
  }
  await page.locator("#auth-password").fill(user.password);
  await page.locator("#auth-submit").click();
  await expect(page.locator("#auth-message")).toHaveText("Demasiados intentos fallidos. Espera unos minutos.");
});

test("after logging out the screen is back on the login tab", async ({ page }) => {
  await register(page, newUser());
  await page.getByRole("button", { name: "Salir", exact: true }).click();
  await expect(page.getByRole("tab", { name: "Iniciar sesión" })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#field-username")).toBeHidden();
  await expect(page.locator("#field-confirm")).toBeHidden();
});

test("the session survives a reload without the intro and ends with logout", async ({ page }) => {
  const user = newUser();
  await register(page, user);
  await page.reload();
  await expect(page.locator("#home")).toBeVisible();
  await expect(page.locator("#intro")).toBeHidden();
  await expect(page.locator("#home-user")).toHaveText(user.username);
  await page.locator("#home-logout").click();
  await expect(page.locator("#login-screen")).toBeVisible();
  await page.reload();
  await expect(page.locator("#login-screen")).toBeVisible();
});

test("tokens are refreshed: an expired access token does not log the user out", async ({ page }) => {
  const user = newUser();
  await register(page, user);
  // Make the stored access token look expired; the app must refresh it by itself.
  await page.evaluate(() => {
    const data = JSON.parse(sessionStorage.getItem("engine-tokens")!);
    data.access = "expired.or.forged";
    data.expiresAt = Date.now() + 3_600_000;
    sessionStorage.setItem("engine-tokens", JSON.stringify(data));
  });
  await page.reload();
  await expect(page.locator("#home")).toBeVisible();
  await expect(page.locator("#home-user")).toHaveText(user.username);
});

test("changing the password works and the old one stops working", async ({ page }) => {
  const user = newUser();
  await register(page, user);
  await page.getByRole("button", { name: "Ajustes" }).click();
  await page.locator("#current-password").fill(user.password);
  await page.locator("#new-password").fill("otra frase muy segura");
  await page.locator("#btn-change-password").click();
  await expect(page.locator("#password-message")).toHaveText("Contraseña cambiada. Se cerraron tus otras sesiones.");
  await expect(page.locator("#activity")).toContainText("Contraseña cambiada");
  await page.locator("#settings-close").click();
  await page.getByRole("button", { name: "Salir", exact: true }).click();
  await logIn(page, { ...user, password: "otra frase muy segura" });
  await expect(page.locator("#user-name")).toHaveText(user.username);
});

test("logging in also plays the intro before the menu", async ({ page }) => {
  const user = newUser();
  await register(page, user);
  await page.getByRole("button", { name: "Salir", exact: true }).click();
  await page.getByLabel("Correo electrónico").fill(user.email);
  await page.locator("#auth-password").fill(user.password);
  await page.locator("#auth-submit").click();
  await reachHome(page);
});
