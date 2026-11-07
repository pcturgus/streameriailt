import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";

const NAME = "sid";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 dienų

function secret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 16) throw new Error("Trūksta AUTH_SECRET (bent 16 simbolių) faile .env");
  return s;
}
const sign = (v: string) => createHmac("sha256", secret()).update(v).digest("base64url");

export function makeToken(uid: string): string {
  const p = Buffer.from(JSON.stringify({ uid, exp: Math.floor(Date.now() / 1000) + MAX_AGE })).toString("base64url");
  return `${p}.${sign(p)}`;
}

export function readToken(t?: string | null): string | null {
  if (!t) return null;
  const [p, sig] = t.split(".");
  if (!p || !sig) return null;
  const a = Buffer.from(sig);
  const b = Buffer.from(sign(p));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const { uid, exp } = JSON.parse(Buffer.from(p, "base64url").toString()) as { uid: string; exp: number };
    return exp > Date.now() / 1000 ? uid : null;
  } catch {
    return null;
  }
}

export async function setSession(uid: string) {
  (await cookies()).set(NAME, makeToken(uid), {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: MAX_AGE,
  });
}

export async function clearSession() {
  (await cookies()).delete(NAME);
}

export async function currentUser() {
  const uid = readToken((await cookies()).get(NAME)?.value);
  if (!uid) return null;
  return prisma.user.findUnique({ where: { id: uid }, select: { id: true, displayName: true, avatarUrl: true } });
}
