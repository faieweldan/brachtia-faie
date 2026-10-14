/**
 * Dani's sandbox database, test-bratchia (10 Oct 2026). Its data is disposable,
 * so every resident - a real one from the master list too - can be deactivated
 * and deleted there for testing. Anywhere else (Lovable Cloud, the live app)
 * the guards that protect real records stay on.
 */
export const SANDBOX_PROJECT = "zyuadtrqcgocottxyzpk";

/** In the browser: is this app connected to the sandbox? */
export const isSandboxClient = () =>
  String((import.meta as any).env?.VITE_SUPABASE_PROJECT_ID ?? "") === SANDBOX_PROJECT ||
  String((import.meta as any).env?.VITE_SUPABASE_URL ?? "").includes(SANDBOX_PROJECT);

/** On the server: is this request working on the sandbox? */
export const isSandboxServer = () =>
  String(process.env["SUPABASE_URL"] ?? "").includes(SANDBOX_PROJECT) ||
  String(process.env["SUPABASE_PROJECT_ID"] ?? "") === SANDBOX_PROJECT;
