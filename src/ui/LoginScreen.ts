import { getMe, logIn, registerAccount, type UserDto } from "../api/client";
import { ApiError } from "../api/http";
import { bindPasswordEyes, byId, errorText } from "./dom";
import { LivingLogo } from "./LivingLogo";
import { passwordStrength } from "./passwordStrength";
import {
  attemptsMessage, checkConfirmation, checkEmail, checkNewPassword, checkUsername, passwordRules,
  type Check, type PasswordRules,
} from "./validation";

type Mode = "login" | "register";
type FieldName = "username" | "email" | "password" | "confirm";

const STRENGTH_COLORS = ["#ff4d6d", "#ff8a3d", "#ffc547", "#33e0a1"];

/** The guide box under each field: what to write there, for each mode. */
const HINTS: Record<Mode, Record<FieldName, string>> = {
  login: {
    username: "",
    email: "El correo con el que creaste tu cuenta, por ejemplo nombre@gmail.com.",
    password: "La contraseña de tu cuenta. Distingue mayúsculas de minúsculas; usa el ojo para verla.",
    confirm: "",
  },
  register: {
    username: "Entre 3 y 20 caracteres: letras, números o guion bajo (_). Es el nombre que verán los demás.",
    email: "Un correo que uses de verdad, por ejemplo nombre@gmail.com. Con él iniciarás sesión.",
    password: "Mínimo 8 caracteres, con letras y números o símbolos. Una frase que recuerdes es lo más seguro.",
    confirm: "Escribe otra vez la misma contraseña para confirmar que no hay errores.",
  },
};

/** The card title is two parts: the second one is painted in the accent blue. */
const COPY: Record<Mode, { title: string; accent: string; subtitle: string; needs: string }> = {
  login: { title: "Tu próximo mundo comienza", accent: "aquí.", subtitle: "Inicia sesión y continúa creando experiencias extraordinarias.", needs: "Para entrar necesitas" },
  register: { title: "Tu aventura empieza", accent: "hoy.", subtitle: "Crea tu cuenta y empieza a forjar tus propios mundos 2D.", needs: "Para crear tu cuenta necesitas" },
};

/**
 * The full-screen access page, the only thing shown before logging in.
 *
 * The left side is the living PixelForge logo; the right side is the form.
 * Every field is checked while typing and says how to fix it; the register
 * form also has a password checklist and meter, a confirmation, the terms
 * checkbox and a Caps Lock warning. A failed login shows how many attempts
 * are left before the lockout (the backend sends the number).
 */
export class LoginScreen {
  private mode: Mode = "login";
  private readonly screen = byId("login-screen");
  private readonly form = byId<HTMLFormElement>("auth-form");
  private readonly inputs: Record<FieldName, HTMLInputElement> = {
    username: byId<HTMLInputElement>("auth-username"),
    email: byId<HTMLInputElement>("auth-email"),
    password: byId<HTMLInputElement>("auth-password"),
    confirm: byId<HTMLInputElement>("auth-confirm"),
  };
  private readonly terms = byId<HTMLInputElement>("auth-terms");
  private readonly submit = byId<HTMLButtonElement>("auth-submit");
  private readonly message = byId("auth-message");
  private readonly banner = byId("auth-banner");
  private readonly living: LivingLogo;
  /** Fields the user already left once: only those show their errors while typing. */
  private readonly touched = new Set<FieldName>();
  private readonly onLoggedIn: (user: UserDto) => Promise<void>;

  constructor(onLoggedIn: (user: UserDto) => Promise<void>) {
    this.onLoggedIn = onLoggedIn;
    this.living = new LivingLogo(byId("login-art"), byId<HTMLCanvasElement>("login-scene"), byId<HTMLCanvasElement>("login-fx"), byId("login-emblem"), byId("wizard-spot"));
    byId("tab-login").addEventListener("click", () => this.setMode("login"));
    byId("tab-register").addEventListener("click", () => this.setMode("register"));
    byId("auth-switch").addEventListener("click", () => this.setMode(this.mode === "login" ? "register" : "login"));
    bindPasswordEyes(this.form);
    for (const [name, input] of Object.entries(this.inputs) as [FieldName, HTMLInputElement][]) {
      input.addEventListener("input", () => this.refresh(name));
      input.addEventListener("blur", () => {
        if (input.value !== "") this.touched.add(name);
        this.refresh(name);
      });
    }
    for (const input of [this.inputs.password, this.inputs.confirm]) {
      input.addEventListener("keyup", (event) => this.showCapsLock(event));
      input.addEventListener("keydown", (event) => this.showCapsLock(event));
    }
    this.terms.addEventListener("change", () => {
      byId("terms-row").classList.remove("is-bad");
      this.showNeeds();
    });
    this.form.addEventListener("submit", (event) => {
      event.preventDefault();
      void this.send();
    });
  }

  setMode(mode: Mode): void {
    this.mode = mode;
    const register = mode === "register";
    byId("auth-tabs").dataset.mode = mode;
    byId("tab-login").setAttribute("aria-selected", String(!register));
    byId("tab-register").setAttribute("aria-selected", String(register));
    for (const element of this.form.querySelectorAll<HTMLElement>(".is-register")) element.hidden = !register;
    this.inputs.password.autocomplete = register ? "new-password" : "current-password";
    this.submit.querySelector(".btn-label")!.textContent = register ? "Crear cuenta" : "Entrar a la forja";
    byId("auth-switch-text").textContent = register ? "¿Ya tienes cuenta?" : "¿No tienes cuenta?";
    byId("auth-switch").textContent = register ? "Inicia sesión" : "Crea una";
    byId("auth-title-text").textContent = COPY[mode].title;
    byId("auth-title-accent").textContent = COPY[mode].accent;
    byId("auth-subtitle").textContent = COPY[mode].subtitle;
    byId("needs-title").textContent = COPY[mode].needs;
    for (const hint of this.form.querySelectorAll<HTMLElement>("[data-hint]")) {
      hint.textContent = HINTS[mode][hint.dataset.hint as FieldName];
    }
    this.touched.clear();
    this.banner.hidden = true;
    this.setMessage("");
    for (const name of Object.keys(this.inputs) as FieldName[]) this.paint(name, { state: "", message: "" });
    this.showPasswordHelp();
    this.showNeeds();
  }

  /** The "what you need" box: which required data is already filled in correctly. */
  private showNeeds(): void {
    const names: FieldName[] = this.mode === "register" ? ["username", "email", "password", "confirm"] : ["email", "password"];
    let done = 0;
    for (const name of names) {
      const ok = this.mode === "login" && name === "password" ? this.inputs.password.value !== "" : this.checkOf(name).state === "ok";
      this.form.querySelector(`[data-need="${name}"]`)!.classList.toggle("is-ok", ok);
      if (ok) done += 1;
    }
    let total = names.length;
    if (this.mode === "register") {
      total += 1;
      this.form.querySelector('[data-need="terms"]')!.classList.toggle("is-ok", this.terms.checked);
      if (this.terms.checked) done += 1;
    }
    byId("needs-count").textContent = `${done} / ${total}`;
    byId("needs-bar").style.transform = `scaleX(${done / total})`;
    byId("auth-needs").classList.toggle("is-complete", done === total);
  }

  /** The check of one field for the current mode. */
  private checkOf(name: FieldName): Check {
    const { username, email, password, confirm } = this.inputs;
    switch (name) {
      case "username":
        return checkUsername(username.value);
      case "email":
        return checkEmail(email.value);
      case "password":
        if (this.mode === "login") return password.value === "" ? { state: "bad", message: "Escribe tu contraseña." } : { state: "", message: "" };
        return checkNewPassword(password.value, email.value.trim(), username.value.trim());
      case "confirm":
        return checkConfirmation(password.value, confirm.value);
    }
  }

  /** While typing only good news shows; errors wait until the field has been left once. */
  private live(name: FieldName): void {
    const check = this.checkOf(name);
    this.paint(name, this.touched.has(name) || check.state === "ok" ? check : { state: "", message: "" });
  }

  private refresh(name: FieldName): void {
    this.setMessage("");
    this.live(name);
    this.showNeeds();
    if (this.mode !== "register") return;
    this.showPasswordHelp();
    if (name !== "confirm" && this.inputs.confirm.value !== "") this.live("confirm");
    if ((name === "username" || name === "email") && this.inputs.password.value !== "") this.live("password");
  }

  private paint(name: FieldName, check: Check): void {
    const field = byId(`field-${name}`);
    field.dataset.state = check.state;
    byId(`msg-${name}`).textContent = check.message;
    field.querySelector(".state")!.textContent = check.state === "ok" ? "✓" : check.state === "bad" ? "!" : "";
    this.inputs[name].toggleAttribute("aria-invalid", check.state === "bad");
  }

  private showPasswordHelp(): void {
    if (this.mode !== "register") return;
    const { username, email, password } = this.inputs;
    const rules: PasswordRules = passwordRules(password.value, email.value.trim(), username.value.trim());
    for (const item of byId("password-rules").querySelectorAll<HTMLElement>("li")) {
      item.classList.toggle("is-ok", password.value !== "" && rules[item.dataset.rule as keyof PasswordRules]);
    }
    const strength = passwordStrength(password.value);
    const filled = password.value === "" ? 0 : Math.max(1, strength.score);
    byId("strength").querySelectorAll<HTMLElement>("i").forEach((bar, i) => {
      bar.style.background = i < filled ? STRENGTH_COLORS[filled - 1] : "";
    });
    byId("strength-label").textContent = password.value === "" ? "Escribe una contraseña" : strength.label;
  }

  private showCapsLock(event: KeyboardEvent): void {
    byId("caps-warning").hidden = !event.getModifierState?.("CapsLock");
  }

  /** Check every visible field; returns the first input that is wrong, or null. */
  private validateAll(): HTMLInputElement | null {
    const names: FieldName[] = this.mode === "register" ? ["username", "email", "password", "confirm"] : ["email", "password"];
    let first: HTMLInputElement | null = null;
    for (const name of names) {
      this.touched.add(name);
      const check = this.checkOf(name);
      this.paint(name, check);
      if (check.state === "bad" && first === null) first = this.inputs[name];
    }
    return first;
  }

  private async send(): Promise<void> {
    const wrong = this.validateAll();
    if (wrong !== null) {
      this.setMessage("Revisa los campos marcados en rojo.", true);
      wrong.focus();
      return;
    }
    if (this.mode === "register" && !this.terms.checked) {
      byId("terms-row").classList.add("is-bad");
      this.setMessage("Debes aceptar las condiciones para crear la cuenta.", true);
      this.terms.focus();
      return;
    }
    this.setBusy(true);
    try {
      const email = this.inputs.email.value.trim();
      const password = this.inputs.password.value;
      if (this.mode === "register") await registerAccount(this.inputs.username.value.trim(), email, password);
      await logIn(email, password);
      const user = await getMe();
      this.inputs.password.value = "";
      this.inputs.confirm.value = "";
      await this.celebrate();
      await this.onLoggedIn(user);
    } catch (error) {
      this.showError(error);
    } finally {
      this.setBusy(false);
    }
  }

  private showError(error: unknown): void {
    if (error instanceof ApiError && error.attemptsLeft !== null && this.mode === "login") {
      this.banner.textContent = `⚠ Correo o contraseña incorrectos. ${attemptsMessage(error.attemptsLeft)}`;
      this.banner.hidden = false;
      this.setMessage("");
      this.paint("password", { state: "bad", message: "Revisa la contraseña y el correo." });
      this.inputs.password.select();
      return;
    }
    this.setMessage(errorText(error), true);
  }

  /** The tick, a lightning strike on the logo and a short pause before the intro. */
  private async celebrate(): Promise<void> {
    byId("auth-success-title").textContent = this.mode === "login" ? "¡Bienvenido de nuevo!" : "¡Cuenta creada!";
    this.form.classList.add("is-done");
    byId("auth-success").hidden = false;
    this.living.celebrate();
    await new Promise((resolve) => window.setTimeout(resolve, 900));
  }

  private setBusy(busy: boolean): void {
    this.submit.classList.toggle("is-loading", busy);
    this.submit.disabled = busy;
    const idle = this.mode === "login" ? "Entrar a la forja" : "Crear cuenta";
    const working = this.mode === "login" ? "Entrando…" : "Creando tu cuenta…";
    this.submit.querySelector(".btn-label")!.textContent = busy ? working : idle;
    for (const input of [...Object.values(this.inputs), this.terms]) input.disabled = busy;
  }

  private setMessage(text: string, isError = false): void {
    this.message.textContent = text;
    this.message.classList.toggle("is-error", isError);
  }

  show(note = ""): void {
    // Coming back after a logout always starts on "Iniciar sesión", never on the register form.
    this.form.classList.remove("is-done");
    byId("auth-success").hidden = true;
    this.terms.checked = false;
    this.setMode("login");
    this.screen.hidden = false;
    this.setMessage(note, note !== "");
    this.living.start();
    this.inputs.email.focus();
  }

  hide(): void {
    this.screen.hidden = true;
    this.living.stop();
  }
}
