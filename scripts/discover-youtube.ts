import { prisma, yt, quotaUsed } from "../lib/youtube";
import { looksLithuanian } from "../lib/lt";

// ===== Nustatymai =====
const QUERIES = ["lietuviškai", "tiesiogiai Lietuva"]; // kiekviena paieška kainuoja 100 YouTube kvotos vienetų
const MAX_YT_CHANNELS = 35; // iš viso YouTube kanalų riba (kiekvienas kanalas kasdien sunaudoja dalį dienos kvotos)

async function main() {
  const force = process.argv.includes("--force");
  const now = new Date();
  // Paieška brangi, todėl vykdoma tik kas 2 val. (kitais kartais praleidžiama)
  if (!force && !(now.getUTCMinutes() < 10 && now.getUTCHours() % 2 === 0)) {
    console.log("YouTube paieška šį kartą praleidžiama (vykdoma kas 2 val.)");
    await prisma.$disconnect();
    return;
  }

  const q0 = quotaUsed;
  const existingCount = await prisma.channel.count({
    where: { platform: "YOUTUBE", status: "APPROVED", NOT: { platformId: { startsWith: "seed-" } } },
  });
  if (existingCount >= MAX_YT_CHANNELS) {
    console.log(`YouTube kanalų jau ${existingCount} (riba ${MAX_YT_CHANNELS}) – naujų neieškome, kad nepritrūktų dienos kvotos`);
    await prisma.$disconnect();
    return;
  }

  // 1) gyvos transliacijos pagal lietuviškas frazes
  const found = new Map<string, string>(); // kanalo ID -> pavadinimas + kanalo vardas
  for (const q of QUERIES) {
    const r = await yt("search", {
      part: "snippet", type: "video", eventType: "live", maxResults: "50",
      relevanceLanguage: "lt", regionCode: "LT", q,
    });
    for (const it of r.items ?? []) {
      const id = it.snippet?.channelId;
      if (id) found.set(id, `${it.snippet.title ?? ""} ${it.snippet.channelTitle ?? ""}`);
    }
  }

  // 2) paliekame tik tuos, kurių dar nėra (nepaliečiame pašalintų ar užblokuotų)
  const ids = [...found.keys()];
  const known = new Set(
    (await prisma.channel.findMany({ where: { platform: "YOUTUBE", platformId: { in: ids } }, select: { platformId: true } })).map((c) => c.platformId)
  );
  const fresh = ids.filter((id) => !known.has(id));

  // 3) kanalo šalis / kalba (1 kvotos vienetas 50 kanalų)
  let added = 0;
  for (let i = 0; i < fresh.length; i += 50) {
    const batch = fresh.slice(i, i + 50);
    const r = await yt("channels", { part: "snippet,statistics", id: batch.join(",") });
    for (const c of r.items ?? []) {
      if (existingCount + added >= MAX_YT_CHANNELS) break;
      const country: string = c.snippet?.country ?? "";
      const text = `${found.get(c.id) ?? ""} ${c.snippet?.title ?? ""} ${c.snippet?.description ?? ""}`;
      // Priimame, jei kanalas nurodęs šalį Lietuva, arba jei tekstas atrodo lietuviškas
      if (country !== "LT" && !looksLithuanian(text)) continue;

      const handle: string = c.snippet?.customUrl ?? "";
      const url = handle.startsWith("@") ? `https://www.youtube.com/${handle}` : `https://www.youtube.com/channel/${c.id}`;
      try {
        await prisma.channel.create({
          data: {
            platform: "YOUTUBE", platformId: c.id, login: handle.replace(/^@/, "") || c.id,
            displayName: c.snippet.title, avatarUrl: c.snippet.thumbnails?.default?.url ?? null, url,
            followers: Number(c.statistics?.subscriberCount ?? 0), language: "lt",
            status: "APPROVED", activatedAt: new Date(),
          },
        });
        added++;
        console.log(`  + ${c.snippet.title} (${country || "šalis nenurodyta"})`);
      } catch {
        /* jau egzistuoja – praleidžiame */
      }
    }
  }

  console.log(`[${new Date().toLocaleTimeString("lt-LT")}] YouTube paieška: rasta ${ids.length}, naujų ${fresh.length}, pridėta ${added}, kvota ~${quotaUsed - q0}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("YouTube paieškos klaida:", e);
  process.exitCode = 1;
});
