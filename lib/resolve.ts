import { Platform } from "@prisma/client";

export type Resolved = {
  platform: Platform;
  platformId: string;
  login: string;
  displayName: string;
  avatarUrl: string | null;
  url: string;
  followers: number;
};

const cache: Record<string, { token: string; exp: number }> = {};

async function appToken(kind: "twitch" | "kick"): Promise<string> {
  const c = cache[kind];
  if (c && Date.now() < c.exp) return c.token;
  const isTwitch = kind === "twitch";
  const r = await fetch(isTwitch ? "https://id.twitch.tv/oauth2/token" : "https://id.kick.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: (isTwitch ? process.env.TWITCH_CLIENT_ID : process.env.KICK_CLIENT_ID) ?? "",
      client_secret: (isTwitch ? process.env.TWITCH_CLIENT_SECRET : process.env.KICK_CLIENT_SECRET) ?? "",
      grant_type: "client_credentials",
    }),
  });
  if (!r.ok) throw new Error(`${kind} token ${r.status}`);
  const j = (await r.json()) as { access_token: string; expires_in?: number };
  cache[kind] = { token: j.access_token, exp: Date.now() + ((j.expires_in ?? 3600) - 300) * 1000 };
  return j.access_token;
}

async function twitch(input: string): Promise<Resolved | null> {
  const m = input.match(/twitch\.tv\/(\w+)/i);
  const login = (m ? m[1] : input).trim().replace(/^@/, "").toLowerCase();
  if (!/^\w{2,25}$/.test(login)) return null;
  const r = await fetch(`https://api.twitch.tv/helix/users?login=${login}`, {
    headers: { Authorization: `Bearer ${await appToken("twitch")}`, "Client-Id": process.env.TWITCH_CLIENT_ID ?? "" },
  });
  if (!r.ok) throw new Error(`Twitch ${r.status}`);
  const u = ((await r.json()) as { data: any[] }).data?.[0];
  if (!u) return null;
  return {
    platform: "TWITCH", platformId: u.id, login: u.login, displayName: u.display_name,
    avatarUrl: u.profile_image_url ?? null, url: `https://twitch.tv/${u.login}`, followers: 0,
  };
}

async function kick(input: string): Promise<Resolved | null> {
  const m = input.match(/kick\.com\/([\w-]+)/i);
  const slug = (m ? m[1] : input).trim().replace(/^@/, "").toLowerCase();
  if (!/^[\w-]{2,40}$/.test(slug)) return null;
  const r = await fetch(`https://api.kick.com/public/v1/channels?slug=${slug}`, {
    headers: { Authorization: `Bearer ${await appToken("kick")}`, Accept: "application/json" },
  });
  if (!r.ok) throw new Error(`Kick ${r.status}`);
  const c = ((await r.json()) as { data?: any[] }).data?.[0];
  const id = c?.broadcaster_user_id ?? c?.user_id;
  if (id === undefined || id === null) return null;
  const s: string = c.slug ?? slug;
  return {
    platform: "KICK", platformId: String(id), login: s, displayName: s, avatarUrl: null,
    url: `https://kick.com/${s}`, followers: 0,
  };
}

async function yt(path: string, params: Record<string, string>) {
  const u = new URL("https://www.googleapis.com/youtube/v3/" + path);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  u.searchParams.set("key", process.env.YOUTUBE_API_KEY ?? "");
  const r = await fetch(u);
  if (!r.ok) throw new Error(`YouTube ${r.status}`);
  return (await r.json()) as { items?: any[] };
}

async function youtube(input: string): Promise<Resolved | null> {
  const s = input.trim();
  let channelId: string | null = /^UC[\w-]{22}$/.test(s) ? s : null;
  let handle: string | null = s.startsWith("@") ? s : null;

  if (!channelId && !handle) {
    let u: URL;
    try {
      u = new URL(s.startsWith("http") ? s : "https://" + s);
    } catch {
      return null;
    }
    const vid = u.searchParams.get("v") ?? (u.hostname === "youtu.be" ? u.pathname.slice(1) : null) ?? u.pathname.match(/^\/(?:live|shorts)\/([\w-]{11})/)?.[1] ?? null;
    if (vid) {
      channelId = (await yt("videos", { part: "snippet", id: vid })).items?.[0]?.snippet?.channelId ?? null;
    } else {
      channelId = u.pathname.match(/^\/channel\/(UC[\w-]{22})/)?.[1] ?? null;
      handle = u.pathname.match(/^\/(@[\w.\-]+)/)?.[1] ?? null;
    }
  }
  if (!channelId && !handle) return null;

  const res = await yt("channels", { part: "snippet,statistics", ...(channelId ? { id: channelId } : { forHandle: handle! }) });
  const c = res.items?.[0];
  if (!c) return null;
  const h: string = c.snippet?.customUrl ?? "";
  return {
    platform: "YOUTUBE", platformId: c.id, login: h.replace(/^@/, "") || c.id, displayName: c.snippet.title,
    avatarUrl: c.snippet.thumbnails?.default?.url ?? null,
    url: h.startsWith("@") ? `https://www.youtube.com/${h}` : `https://www.youtube.com/channel/${c.id}`,
    followers: Number(c.statistics?.subscriberCount ?? 0),
  };
}

export function resolveChannel(platform: Platform, input: string): Promise<Resolved | null> {
  return platform === "TWITCH" ? twitch(input) : platform === "KICK" ? kick(input) : youtube(input);
}
