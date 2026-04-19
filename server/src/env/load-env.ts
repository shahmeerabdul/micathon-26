import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

let didAttemptLoad = false;

function parseDotEnv(content: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const equals = line.indexOf("=");
    if (equals <= 0) continue;
    const key = line.slice(0, equals).trim();
    const value = line.slice(equals + 1).trim();
    if (key) {
      env[key] = value;
    }
  }
  return env;
}

/**
 * Next.js already loads `.env.local`, but for local teammate workflows we also
 * support reading `server/.env.example` as a fallback source.
 */
export function loadServerEnvFallback(): void {
  if (didAttemptLoad) return;
  didAttemptLoad = true;

  const candidates = [
    resolve(process.cwd(), "../server/.env.example"),
    resolve(process.cwd(), "server/.env.example"),
  ];

  const envFile = candidates.find((path) => existsSync(path));
  if (!envFile) return;

  const parsed = parseDotEnv(readFileSync(envFile, "utf8"));
  for (const [key, value] of Object.entries(parsed)) {
    if (!process.env[key] && value) {
      process.env[key] = value;
    }
  }
}
