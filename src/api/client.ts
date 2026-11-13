import type { BalanceDto, CreationDto } from "../game/balance";
import type { GameObject } from "../model/GameObject";
import { HttpClient } from "./http";
import { TokenStore, type TokenPair } from "./tokens";
import { TTL, cached, forgetAll, remember } from "./cache";
import { DEMO_USER, DemoServer } from "../demo/DemoServer";

export { ApiError } from "./http";

const BASE_URL: string = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

/** The only door to the backend. The frontend never calls the AI service. */
export const http = new HttpClient(BASE_URL, new TokenStore());

export interface UserDto {
  id: number;
  username: string;
  email: string;
}

export interface ProjectDto {
  id: number;
  owner_id: number;
  name: string;
  scene: GameObject[];
  updated_at: string;
  /** Only in the answer of askAi: how many objects the AI removed and added. */
  ai?: { added: number; removed: number };
}

export interface TemplateDto {
  code: string;
  name: string;
  description: string;
  object_count: number;
  /** The scene itself, for the map preview (older backends do not send it). */
  scene?: GameObject[];
}

export interface VersionDto {
  version_number: number;
  note: string;
  created_at: string;
  object_count: number;
}

export function registerAccount(username: string, email: string, password: string): Promise<UserDto> {
  return http.sealedRequest<UserDto>("/auth/register", { username, email, password });
}

/** Log in and keep the access and refresh tokens. */
export async function logIn(email: string, password: string): Promise<void> {
  forgetAll();
  const pair = await http.sealedRequest<TokenPair>("/auth/login", { email, password });
  http.tokens.save(pair);
}

// --- Demo: try the engine without an account --------------------------------------------------

let demo: DemoServer | null = null;

/**
 * Start the demo: from now on every request is answered inside the browser
 * (DemoServer), so nothing reaches the real server and no account is touched.
 * Any session tokens are forgotten first, so the demo can never act as a real user.
 */
export function startDemo(): UserDto {
  http.tokens.clear();
  forgetAll();
  demo = new DemoServer();
  http.useDemo(demo);
  return DEMO_USER;
}

/** A demo left running in this tab (the page was reloaded): pick it up again. */
export function resumeDemo(): boolean {
  if (demo !== null || !DemoServer.saved()) return demo !== null;
  startDemo();
  return true;
}

export function isDemo(): boolean {
  return demo !== null;
}

/** Leave the demo and erase everything it created. */
function stopDemo(): void {
  demo?.wipe();
  demo = null;
  http.useDemo(null);
  forgetAll();
}

export function getMe(): Promise<UserDto> {
  return http.request<UserDto>("/auth/me");
}

/** Revoke both tokens on the backend, then forget them here too. */
export async function logOut(): Promise<void> {
  if (demo !== null) {
    stopDemo();
    return;
  }
  const refresh = http.tokens.refresh;
  try {
    if (http.tokens.access !== null) {
      await http.request<void>("/auth/logout", { method: "POST", body: JSON.stringify({ refresh_token: refresh }) });
    }
  } catch {
    // even if the backend is unreachable we still forget the tokens locally
  }
  http.tokens.clear();
  forgetAll(); // cached answers belong to this account
}

export function hasSession(): boolean {
  return http.tokens.refresh !== null || demo !== null;
}

export function listProjects(): Promise<ProjectDto[]> {
  return http.request<ProjectDto[]>("/projects");
}

export function listTemplates(): Promise<TemplateDto[]> {
  return cached("templates", TTL.reference, () => http.request<TemplateDto[]>("/projects/templates"));
}

export function createProject(name: string, template?: string): Promise<ProjectDto> {
  return http.request<ProjectDto>("/projects", { method: "POST", body: JSON.stringify({ name, template }) });
}

export function getProject(id: number): Promise<ProjectDto> {
  return http.request<ProjectDto>(`/projects/${id}`);
}

export function renameProject(id: number, name: string): Promise<ProjectDto> {
  return http.request<ProjectDto>(`/projects/${id}`, { method: "PATCH", body: JSON.stringify({ name }) });
}

export function deleteProject(id: number): Promise<void> {
  return http.request<void>(`/projects/${id}`, { method: "DELETE" });
}

export function duplicateProject(id: number): Promise<ProjectDto> {
  return http.request<ProjectDto>(`/projects/${id}/duplicate`, { method: "POST" });
}

export function saveScene(id: number, scene: GameObject[], note = ""): Promise<ProjectDto> {
  return http.request<ProjectDto>(`/projects/${id}/scene`, { method: "PUT", body: JSON.stringify({ scene, note }) });
}

export function listVersions(id: number): Promise<VersionDto[]> {
  return http.request<VersionDto[]>(`/projects/${id}/versions`);
}

export function restoreVersion(id: number, version: number): Promise<ProjectDto> {
  return http.request<ProjectDto>(`/projects/${id}/versions/${version}/restore`, { method: "POST" });
}

export type DifficultyLevel = "easy" | "medium" | "hard" | "extreme";

export interface AiModelDto {
  samples_seen: number;
  version: number;
  difficulty: number;
  level?: DifficultyLevel;
  parameters: Record<string, unknown>;
}

/** Choose the difficulty of a level by hand; the AI keeps learning from there. */
export function setAiDifficulty(id: number, level: DifficultyLevel): Promise<AiModelDto> {
  return http.request<AiModelDto>(`/projects/${id}/ai/difficulty`, { method: "PUT", body: JSON.stringify({ level }) });
}

export function askAi(id: number, prompt: string): Promise<ProjectDto> {
  return http.request<ProjectDto>(`/projects/${id}/ai`, { method: "POST", body: JSON.stringify({ prompt }) });
}

export function aiObstacles(id: number, count: number): Promise<ProjectDto & { added: number; difficulty: number }> {
  return http.request(`/projects/${id}/ai/obstacles`, { method: "POST", body: JSON.stringify({ count }) });
}

export function aiModel(id: number): Promise<AiModelDto> {
  return http.request<AiModelDto>(`/projects/${id}/ai/model`);
}

export interface RunResultDto {
  outcome: "won" | "lost" | "quit";
  score: number;
  coins_collected: number;
  coins_total: number;
  enemies_defeated: number;
  damage_taken: number;
  deaths: number;
  duration_ms: number;
  events: { kind: string; x?: number; y?: number; at_ms: number }[];
}

export interface FinishDto {
  learned: boolean;
  difficulty: number;
  reward?: number;
  achievements: string[];
}

export function startRun(projectId: number): Promise<{ id: number; difficulty: number }> {
  return http.request(`/projects/${projectId}/plays`, { method: "POST" });
}

export function finishRun(projectId: number, runId: number, result: RunResultDto): Promise<FinishDto> {
  return http.request<FinishDto>(`/projects/${projectId}/plays/${runId}/finish`, {
    method: "POST",
    body: JSON.stringify(result),
  });
}

export interface StatsDto {
  games_played: number;
  games_won: number;
  total_score: number;
  best_score: number;
  coins_collected: number;
  enemies_defeated: number;
  deaths: number;
  play_time_ms: number;
}

export interface AchievementDto {
  code: string;
  name: string;
  description: string;
  points: number;
  unlocked_at: string;
}

export function myStats(): Promise<StatsDto> {
  return http.request<StatsDto>("/me/stats");
}

export function myAchievements(): Promise<AchievementDto[]> {
  return http.request<AchievementDto[]>("/me/achievements");
}

export function leaderboard(projectId: number): Promise<{ username: string; score: number }[]> {
  return http.request(`/projects/${projectId}/leaderboard`);
}

export interface SettingsDto {
  theme: "light" | "dark" | "system";
  language: "es" | "en";
  show_grid: boolean;
  snap_to_grid: boolean;
  grid_size: number;
  music_volume: number;
  sfx_volume: number;
}

/** What each 2D character says, by kind (from the database). */
export function getCharacterLines(): Promise<Record<string, string[]>> {
  return cached("characters", TTL.reference, () => http.request<Record<string, string[]>>("/catalog/characters"));
}

export function getSettings(): Promise<SettingsDto> {
  return cached("settings", TTL.settings, () => http.request<SettingsDto>("/me/settings"));
}

export async function saveSettings(settings: SettingsDto): Promise<SettingsDto> {
  const saved = await http.request<SettingsDto>("/me/settings", { method: "PUT", body: JSON.stringify(settings) });
  remember("settings", saved, TTL.settings);
  return saved;
}

export interface ActivityDto {
  action: string;
  created_at: string;
}

/** Change the password; the backend ends every other session of the account. */
export function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  return http.sealedRequest<void>("/auth/password", { current_password: currentPassword, new_password: newPassword });
}

/** Revoke every refresh token of the account (all devices), then forget ours. */
export async function logOutEverywhere(): Promise<void> {
  await http.request<void>("/auth/logout-all", { method: "POST" });
  http.tokens.clear();
  forgetAll(); // cached answers belong to this account
}

export function myActivity(): Promise<ActivityDto[]> {
  return http.request<ActivityDto[]>("/me/activity");
}

// --- Admin panel of the account (balance and own creations) ---------------------------------

export type { BalanceDto, CreationDto };

/** Fields of a creation the panel sends (the id and dates come from the backend). */
export type CreationInput = Omit<CreationDto, "id">;

export function getBalance(): Promise<BalanceDto> {
  return http.request<BalanceDto>("/me/balance");
}

export function saveBalance(balance: BalanceDto): Promise<BalanceDto> {
  return http.request<BalanceDto>("/me/balance", { method: "PUT", body: JSON.stringify(balance) });
}

export function listCreations(): Promise<CreationDto[]> {
  return http.request<CreationDto[]>("/me/creations");
}

export function createCreation(creation: CreationInput): Promise<CreationDto> {
  return http.request<CreationDto>("/me/creations", { method: "POST", body: JSON.stringify(creation) });
}

export function updateCreation(id: number, creation: CreationInput): Promise<CreationDto> {
  return http.request<CreationDto>(`/me/creations/${id}`, { method: "PUT", body: JSON.stringify(creation) });
}

export function deleteCreation(id: number): Promise<void> {
  return http.request<void>(`/me/creations/${id}`, { method: "DELETE" });
}
