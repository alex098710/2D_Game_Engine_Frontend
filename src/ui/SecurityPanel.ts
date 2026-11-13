import { changePassword, logOutEverywhere, myActivity } from "../api/client";
import { once } from "./busy";
import { bindPasswordEyes, byId, errorText, make } from "./dom";
import { passwordProblem } from "./passwordPolicy";
import { relativeTime } from "./ProjectList";
import { toast } from "./toast";

/** Spanish names for the security events the backend records. */
const ACTIONS: Record<string, string> = {
  "user.register": "Cuenta creada",
  "user.login": "Inicio de sesión",
  "user.logout": "Cierre de sesión",
  "user.logout_all": "Cierre en todos los dispositivos",
  "user.password_changed": "Contraseña cambiada",
  "token.reuse_detected": "Intento de reutilizar una sesión robada (bloqueado)",
};

export function actionName(action: string): string {
  return ACTIONS[action] ?? action;
}

/**
 * The "Seguridad" section of the settings drawer: change the password, close
 * every session and see the latest security events of the account.
 */
export class SecurityPanel {
  private readonly getUser: () => { email: string; username: string } | null;
  private readonly onLoggedOutEverywhere: () => void;

  constructor(getUser: () => { email: string; username: string } | null, onLoggedOutEverywhere: () => void) {
    this.getUser = getUser;
    this.onLoggedOutEverywhere = onLoggedOutEverywhere;
    byId<HTMLFormElement>("password-form").addEventListener("submit", (event) => {
      event.preventDefault();
      void this.changePassword();
    });
    byId("btn-logout-all").addEventListener("click", () => void this.logOutEverywhere());
    bindPasswordEyes(byId("password-form"));
  }

  private async changePassword(): Promise<void> {
    const current = byId<HTMLInputElement>("current-password");
    const next = byId<HTMLInputElement>("new-password");
    const message = byId("password-message");
    const user = this.getUser();
    const problem = passwordProblem(next.value, user?.email, user?.username);
    message.classList.remove("is-error", "is-success");
    if (problem !== null) {
      message.textContent = problem;
      message.classList.add("is-error");
      return;
    }
    await once(byId<HTMLButtonElement>("btn-change-password"), async () => {
    try {
      await changePassword(current.value, next.value);
      current.value = "";
      next.value = "";
      message.textContent = "Contraseña cambiada. Se cerraron tus otras sesiones.";
      message.classList.add("is-success");
      await this.refresh();
    } catch (error) {
      message.textContent = errorText(error);
      message.classList.add("is-error");
    }
    });
  }

  private async logOutEverywhere(): Promise<void> {
    if (!window.confirm("¿Cerrar la sesión en todos tus dispositivos, también en este?")) return;
    await once(byId<HTMLButtonElement>("btn-logout-all"), async () => {
      try {
        await logOutEverywhere();
        this.onLoggedOutEverywhere();
      } catch (error) {
        toast(errorText(error), "error");
      }
    });
  }

  /** Show the latest security events of the account. */
  async refresh(): Promise<void> {
    const list = byId("activity");
    try {
      const events = await myActivity();
      list.replaceChildren(
        ...events.slice(0, 8).map((event) => {
          const item = make("li");
          item.append(make("span", "", actionName(event.action)), make("small", "", relativeTime(event.created_at)));
          return item;
        }),
      );
      if (events.length === 0) list.append(make("li", "empty", "Sin actividad todavía."));
    } catch {
      list.replaceChildren(make("li", "empty", "No se pudo cargar la actividad."));
    }
  }
}
