import { PrismaClient } from "@prisma/client";

try {
  process.loadEnvFile();
} catch {
  /* .env nerastas */
}

export const prisma = new PrismaClient();

const KEY = process.env.YOUTUBE_API_KEY;
if (!KEY) {
  console.error("Trūksta YOUTUBE_API_KEY faile .env");
  process.exit(1);
}

export let quotaUsed = 0;

// Kiekviena čia naudojama užklausa kainuoja 1 kvotos vienetą (dienos limitas 10 000)
export async function yt(path: string, params: Record<string, string>): Promise<any> {
  const u = new URL("https://www.googleapis.com/youtube/v3/" + path);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  u.searchParams.set("key", KEY!);
  quotaUsed += 1;
  const r = await fetch(u);
  if (!r.ok) throw new Error(`YouTube API ${r.status}: ${await r.text()}`);
  return r.json();
}

export async function addChannelById(channelId: string) {
  const res = await yt("channels", { part: "snippet,statistics", id: channelId });
  const c = res.items?.[0];
  if (!c) throw new Error("Kanalas nerastas: " + channelId);

  const handle: string = c.snippet.customUrl ?? "";
  const login = handle.replace(/^@/, "") || channelId;
  const url = handle.startsWith("@")
    ? `https://www.youtube.com/${handle}`
    : `https://www.youtube.com/channel/${channelId}`;
  const avatarUrl: string | null = c.snippet.thumbnails?.default?.url ?? null;
  const followers = Number(c.statistics?.subscriberCount ?? 0);

  return prisma.channel.upsert({
    where: { platform_platformId: { platform: "YOUTUBE", platformId: channelId } },
    update: { login, displayName: c.snippet.title, avatarUrl, url, followers },
    create: {
      platform: "YOUTUBE", platformId: channelId, login, displayName: c.snippet.title,
      avatarUrl, url, followers, language: "lt", status: "APPROVED",
    },
  });
}
