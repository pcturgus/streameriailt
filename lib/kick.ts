import { PrismaClient } from "@prisma/client";

try {
  process.loadEnvFile();
} catch {
  /* .env nerastas */
}

export const prisma = new PrismaClient();

const ID = process.env.KICK_CLIENT_ID;
const SECRET = process.env.KICK_CLIENT_SECRET;
if (!ID || !SECRET) {
  console.error("Trūksta KICK_CLIENT_ID arba KICK_CLIENT_SECRET faile .env");
  process.exit(1);
}

let token = "";
let tokenExp = 0;

async function getToken(): Promise<string> {
  if (token && Date.now() < tokenExp) return token;
  const r = await fetch("https://id.kick.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: ID!, client_secret: SECRET! }),
  });
  if (!r.ok) throw new Error(`Kick token klaida ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = (await r.json()) as { access_token: string; expires_in?: number };
  token = j.access_token;
  tokenExp = Date.now() + ((j.expires_in ?? 3600) - 300) * 1000;
  return token;
}

export async function kick(path: string, query: [string, string][] = []): Promise<any> {
  const u = new URL("https://api.kick.com/public/v1" + path);
  for (const [k, v] of query) u.searchParams.append(k, v);
  const r = await fetch(u, { headers: { Authorization: `Bearer ${await getToken()}`, Accept: "application/json" } });
  if (!r.ok) {
    if (r.status === 401) tokenExp = 0;
    throw new Error(`Kick API ${r.status} (${path}): ${(await r.text()).slice(0, 200)}`);
  }
  return r.json();
}
