import { prisma, kick } from "../lib/kick";

const RAW = process.argv.includes("--raw");

function categoryOf(game: string): string {
  const g = game.toLowerCase();
  if (["just chatting", "music", "irl", "talk shows & podcasts", "asmr", "art"].includes(g)) return "irl";
  if (g.includes("science") || g.includes("software") || g.includes("technology")) return "tech";
  if (["counter-strike", "counter-strike 2", "dota 2", "league of legends", "rainbow six siege", "valorant"].includes(g)) return "esports";
  return "gaming";
}

// Kick atsakymo laukų pavadinimus skaitome atsargiai (keli galimi variantai)
const g = (o: any, ...keys: string[]) => keys.map((k) => o?.[k]).find((v) => v !== undefined && v !== null);

// Transliacijos valandų skaičiavimas: pridedame laiką nuo praėjusio patikrinimo, jei kanalas jau buvo gyvas.
// Jei tarpas per ilgas (workeris praleido paleidimus) arba tai pirmas pastebėjimas, skiriame nedidelį kreditą.
const GAP_CAP_MS = 20 * 60_000;
const FIRST_SEEN_CREDIT_H = 5 / 60;
function hoursSince(prev: { isLive: boolean; updatedAt: Date } | null, nowMs: number): number {
  if (prev?.isLive) {
    const d = nowMs - prev.updatedAt.getTime();
    if (d >= 0 && d <= GAP_CAP_MS) return d / 3_600_000;
  }
  return FIRST_SEEN_CREDIT_H;
}

async function sync() {
  const t0 = Date.now();
  const found = new Map<string, any>();

  // 1) Visi lietuviški srautai pagal kalbą
  try {
    const res = await kick("/livestreams", [["language", "lt"], ["sort", "viewer_count"], ["limit", "100"]]);
    for (const s of res.data ?? []) {
      const id = g(s, "broadcaster_user_id", "user_id");
      if (id !== undefined) found.set(String(id), s);
    }
    if (RAW) console.log("Pirmas įrašas (language=lt):", JSON.stringify((res.data ?? [])[0] ?? null, null, 2));
  } catch (e) {
    console.error("language=lt užklausa nepavyko:", (e as Error).message);
  }
  const byLang = found.size;

  // 2) Mūsų sąrašo kanalai (pridėti per add:kick)
  const watch = await prisma.channel.findMany({
    where: { platform: "KICK", status: "APPROVED", NOT: { platformId: { startsWith: "seed-" } } },
  });
  const ids = watch.map((c) => c.platformId);
  for (let i = 0; i < ids.length; i += 50) {
    try {
      const res = await kick("/livestreams", ids.slice(i, i + 50).map((id) => ["broadcaster_user_id", id] as [string, string]));
      for (const s of res.data ?? []) {
        const id = g(s, "broadcaster_user_id", "user_id");
        if (id !== undefined) found.set(String(id), s);
      }
    } catch (e) {
      console.error("Sąrašo užklausa nepavyko:", (e as Error).message);
    }
  }

  const today = new Date(new Date().toISOString().slice(0, 10));
  const liveIds: string[] = [];

  for (const [id, s] of found) {
    const slug = g(s, "slug", "channel_slug");
    if (!slug) {
      console.warn("Praleistas įrašas be 'slug' lauko:", JSON.stringify(s).slice(0, 200));
      continue;
    }
    liveIds.push(id);
    const viewers = Number(g(s, "viewer_count", "viewers") ?? 0);
    const catName: string = s.category?.name ?? g(s, "category_name") ?? "Nenurodyta";
    const thumbRaw = g(s, "thumbnail", "thumbnail_url");
    const thumbnailUrl: string | null = typeof thumbRaw === "object" ? thumbRaw?.url ?? null : thumbRaw ?? null;
    const avatarUrl: string | null = g(s, "profile_picture", "avatar") ?? null;
    const url = `https://kick.com/${slug}`;

    const ch = await prisma.channel.upsert({
      where: { platform_platformId: { platform: "KICK", platformId: id } },
      update: { login: slug, displayName: slug, url, ...(avatarUrl ? { avatarUrl } : {}) },
      create: {
        platform: "KICK", platformId: id, login: slug, displayName: slug,
        avatarUrl, url, language: "lt", status: "APPROVED",
      },
    });

    const tagsRaw = g(s, "custom_tags", "tags");
    const data = {
      isLive: true,
      title: String(g(s, "stream_title", "title", "session_title") ?? slug),
      game: catName,
      category: categoryOf(catName),
      viewers,
      thumbnailUrl,
      tags: Array.isArray(tagsRaw) ? tagsRaw.slice(0, 3).map(String) : [],
      startedAt: g(s, "started_at", "start_time") ? new Date(g(s, "started_at", "start_time")) : null,
    };
    const prevLive = await prisma.liveStream.findUnique({ where: { channelId: ch.id }, select: { isLive: true, updatedAt: true } });
    const addHours = hoursSince(prevLive, Date.now());
    await prisma.liveStream.upsert({ where: { channelId: ch.id }, update: data, create: { channelId: ch.id, ...data } });

    const key = { channelId_date: { channelId: ch.id, date: today } };
    const prev = await prisma.channelStat.findUnique({ where: key });
    await prisma.channelStat.upsert({
      where: key,
      update: {
        peakViewers: Math.max(prev?.peakViewers ?? 0, viewers),
        hoursStreamed: { increment: addHours },
        avgViewers: Math.round((prev?.avgViewers ?? viewers) * 0.9 + viewers * 0.1),
      },
      create: { channelId: ch.id, date: today, followers: ch.followers, avgViewers: viewers, peakViewers: viewers, hoursStreamed: addHours },
    });
  }

  const off = await prisma.liveStream.updateMany({
    where: { isLive: true, channel: { platform: "KICK", platformId: { notIn: liveIds } } },
    data: { isLive: false, viewers: 0 },
  });

  console.log(
    `[${new Date().toLocaleTimeString("lt-LT")}] Kick: gyvai ${liveIds.length} (pagal kalbą ${byLang}, sąraše ${watch.length}), baigė ${off.count}, ${((Date.now() - t0) / 1000).toFixed(1)} s`
  );
}

async function run() {
  try {
    await sync();
  } catch (e) {
    console.error("Sinchronizacijos klaida:", e);
    process.exitCode = 1; // GitHub darbas pažymimas kaip nepavykęs
  }
}

async function main() {
  if (process.argv.includes("--loop")) {
    await run();
    setInterval(run, 2 * 60_000);
  } else {
    await run();
    await prisma.$disconnect();
  }
}
main();
