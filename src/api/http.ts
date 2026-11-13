import { seal, sealingAvailable, type Challenge } from "./seal";
import { TokenStore, type TokenPair } from "./tokens";

export class ApiError extends Error {
  readonly status: number;
  /** Failed logins left before the lockout (from X-Attempts-Remaining), when the server says. */
  readonly attemptsLeft: number | null;

  constructor(status: number, message: string, attemptsLeft: number | null = null) {
    super(message);
    this.status = status;
    this.attemptsLeft = attemptsLeft;
  }
}

const MESSAGES: Record<string, string> = {
  "Invalid email or password": "Correo o contraseña incorrectos.",
  "Email already registered": "Ese correo ya tiene una cuenta.",
  "Too many failed attempts, try again later": "Demasiados intentos fallidos. Espera unos minutos.",
  "Invalid or missing token": "Tu sesión terminó. Vuelve a iniciar sesión.",
  "Invalid refresh token": "Tu sesión terminó. Vuelve a iniciar sesión.",
  "Project not found": "No se encontró el proyecto.",
  "AI service is not configured": "La IA no está configurada en el servidor.",
  "Too many requests, slow down": "Vas demasiado rápido. Espera un momento y vuelve a intentarlo.",
  "Request body too large": "Los datos enviados son demasiado grandes.",
  "Current password is wrong": "La contraseña actual no es correcta.",
  "Password is too common": "Esa contraseña es demasiado común.",
  "Password repeats too few characters": "La contraseña repite demasiados caracteres.",
  "Password cannot be only numbers": "La contraseña no puede tener solo números.",
  "Password cannot contain your email or username": "La contraseña no puede contener tu correo ni tu usuario.",
  "Password must have at least 8 characters": "La contraseña necesita al menos 8 caracteres.",
  "New password must be different": "La nueva contraseña debe ser distinta de la actual.",
  "Version not found": "No se encontró esa versión.",
  "Unknown template": "Esa plantilla no existe.",
  "Run not found or already finished": "La partida ya había terminado.",
  "Internal server error": "Error interno del servidor. Inténtalo de nuevo.",
  "Sealed request invalid or expired": "La conexión segura caducó. Inténtalo de nuevo.",
};

const SEAL_EXPIRED = "Sealed request invalid or expired";

/** Spanish text for an error. The backend speaks English; the user never sees it. */
/** A server message written in Spanish for the player (not a technical one in English). */
export function isForThePlayer(detail: string): boolean {
  return detail.length > 0 && detail.length <= 200 && (/[áéíóúñ¿¡]/i.test(detail) || /^(El|La|Los|Las|Esa|Ese|Esta|Este|Puedes|Una|Un|No|Tu|Hay|Pide|Escribe) /.test(detail));
}

export function friendlyMessage(status: number, detail: string): string {
  if (MESSAGES[detail]) return MESSAGES[detail];
  // Messages the server already wrote for the player, in Spanish (e.g. why a picture was refused).
  if ([400, 409, 413, 422, 503].includes(status) && isForThePlayer(detail)) return detail;
  if (status === 0) return "No se pudo conectar con el servidor.";
  if (status === 401) return "Tu sesión terminó. Vuelve a iniciar sesión.";
  if (status === 403) return "No tienes permiso para hacer esto.";
  if (status === 404) return "No se encontró lo que buscabas.";
  if (status === 413) return "Los datos enviados son demasiado grandes.";
  if (status === 422) return "Hay datos no válidos en el formulario.";
  if (status === 429) return "Demasiadas peticiones. Espera un momento.";
  if (status === 502 || status === 503) return "La IA no respondió. Inténtalo de nuevo.";
  return `Algo salió mal (código ${status}). Inténtalo de nuevo.`;
}

type Fetch = typeof fetch;

/**
 * Talks ONLY to the backend. Adds the access token to every request and,
 * when the backend answers 401, refreshes the tokens once and retries.
 * Concurrent requests share a single refresh.
 */
/** Something that answers the app's requests without the network (the demo, see src/demo). */
export interface DemoHandler {
  handle(path: string, method: string, body: unknown): Promise<unknown>;
}

export class HttpClient {
  readonly tokens: TokenStore;
  private readonly baseUrl: string;
  private readonly fetcher: Fetch;
  private refreshing: Promise<boolean> | null = null;
  private onSessionLost: () => void = () => {};
  /** The demo's server in the browser: while set, no request reaches the network. */
  private demo: DemoHandler | null = null;

  constructor(baseUrl: string, tokens: TokenStore, fetcher: Fetch = (...args) => fetch(...args)) {
    this.baseUrl = baseUrl;
    this.tokens = tokens;
    this.fetcher = fetcher;
  }

  /** Answer every request with the demo's own server (null: back to the real one). */
  useDemo(handler: DemoHandler | null): void {
    this.demo = handler;
  }

  get inDemo(): boolean {
    return this.demo !== null;
  }

  /** Called when the session cannot be refreshed any more (user must log in again). */
  whenSessionLost(handler: () => void): void {
    this.onSessionLost = handler;
  }

  private async send(path: string, init: RequestInit, token: string | null): Promise<Response> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token !== null) headers["Authorization"] = `Bearer ${token}`;
    try {
      return await this.fetcher(`${this.baseUrl}${path}`, { ...init, headers });
    } catch {
      throw new ApiError(0, friendlyMessage(0, ""));
    }
  }

  private static async errorOf(response: Response): Promise<ApiError> {
    let detail = response.statusText;
    try {
      const body = await response.json();
      if (typeof body.detail === "string") detail = body.detail;
    } catch {
      // keep the status text
    }
    const left = Number.parseInt(response.headers.get("X-Attempts-Remaining") ?? "", 10);
    return new ApiError(response.status, friendlyMessage(response.status, detail), Number.isNaN(left) ? null : left);
  }

  /** Exchange the refresh token for a new pair. Only one refresh runs at a time. */
  refreshTokens(): Promise<boolean> {
    if (this.demo !== null) return Promise.resolve(false);
    if (this.refreshing === null) {
      this.refreshing = this.doRefresh().finally(() => {
        this.refreshing = null;
      });
    }
    return this.refreshing;
  }

  /**
   * Refresh tokens rotate and the backend treats reusing an old one as theft (it revokes them all).
   * With several tabs open, only one may refresh at a time: the Web Locks API serialises them, and
   * inside the lock the storage is read again in case another tab already got a new pair.
   */
  private async doRefresh(): Promise<boolean> {
    const used = this.tokens.refresh;
    const locks = typeof navigator !== "undefined" ? (navigator as Navigator & { locks?: LockManager }).locks : undefined;
    if (locks === undefined) return this.refreshNow();
    return locks.request("engine-token-refresh", async () => {
      this.tokens.reload();
      if (this.tokens.refresh !== null && this.tokens.refresh !== used && !this.tokens.expiresSoon(15_000)) {
        return true; // another tab refreshed while we waited
      }
      return this.refreshNow();
    });
  }

  private async refreshNow(): Promise<boolean> {
    const refresh = this.tokens.refresh;
    if (refresh === null) return false;
    // The refresh token goes sealed and the new pair comes back sealed (see seal.ts).
    const sealed = await this.sealBody({ refresh_token: refresh }).catch(() => null);
    const body = sealed?.body ?? JSON.stringify({ refresh_token: refresh });
    const response = await this.send("/auth/refresh", { method: "POST", body }, null).catch(() => null);
    if (response === null || !response.ok) {
      // Only a rejected refresh token ends the session. A sleeping server (502/503), a rate limit,
      // an expired seal (400 with its own message) or no network keeps the tokens.
      if (response !== null && [401, 403].includes(response.status)) this.tokens.clear();
      return false;
    }
    const answer: unknown = await response.json();
    this.tokens.save(sealed ? await sealed.open<TokenPair>(answer) : (answer as TokenPair));
    return true;
  }

  /** Seal a body for one request, or null when the browser cannot (then it goes plain, over HTTPS). */
  private async sealBody(payload: unknown) {
    if (!sealingAvailable()) return null;
    const response = await this.send("/auth/challenge", { method: "GET" }, null);
    if (!response.ok) throw await HttpClient.errorOf(response);
    return seal(payload, (await response.json()) as Challenge);
  }

  /**
   * POST an account request (login, register, password) as one encrypted block and open the
   * encrypted answer. If the one-time challenge expired on the way (a slow phone, a restarted
   * server), it asks for a new one once.
   */
  async sealedRequest<T>(path: string, payload: unknown): Promise<T> {
    if (this.demo !== null) return this.request<T>(path, { method: "POST", body: JSON.stringify(payload) });
    for (let attempt = 0; ; attempt++) {
      const sealed = await this.sealBody(payload);
      if (sealed === null) return this.request<T>(path, { method: "POST", body: JSON.stringify(payload) });
      try {
        const answer = await this.request<unknown>(path, { method: "POST", body: sealed.body });
        return await sealed.open<T>(answer);
      } catch (error) {
        const expired = error instanceof ApiError && error.status === 400 && error.message === friendlyMessage(400, SEAL_EXPIRED);
        if (!expired || attempt >= 1) throw error;
      }
    }
  }

  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    if (this.demo !== null) {
      const body = typeof init.body === "string" && init.body !== "" ? JSON.parse(init.body) : undefined;
      return (await this.demo.handle(path, init.method ?? "GET", body)) as T;
    }
    if (this.tokens.access !== null && this.tokens.expiresSoon(15_000)) {
      await this.refreshTokens();
    }
    let response = await this.send(path, init, this.tokens.access);
    if (response.status === 401 && this.tokens.refresh !== null) {
      const refreshed = await this.refreshTokens();
      if (refreshed) {
        response = await this.send(path, init, this.tokens.access);
      } else if (this.tokens.refresh !== null) {
        // The refresh could not reach a working server (asleep, no network): the session is
        // still valid, so it is kept and the caller sees a temporary error to retry.
        throw new ApiError(503, friendlyMessage(503, ""));
      }
      if (response.status === 401) {
        this.tokens.clear();
        this.onSessionLost();
      }
    }
    if (!response.ok) throw await HttpClient.errorOf(response);
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }
}
