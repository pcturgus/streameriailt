import { PrismaClient } from "@prisma/client";

try {
  process.loadEnvFile();
} catch {
  /* .env nerastas */
}

const prisma = new PrismaClient();

// Reitingo formulė (0–100):
//   60 %  vidutiniai žiūrovai per mėnesį (logaritminė skalė, kad milžinai neužgožtų visų)
//   25 %  didžiausias žiūrovų skaičius per mėnesį (logaritminė skalė)
//   15 %  aktyvumas: kiek mėnesio dienų kanalas transliavo
// Augimas (%) rodomas, bet į taškus kol kas neįskaičiuojamas, nes sekėjų skaičius
// žinomas ne iš visų platformų.
const W = { avg: 0.6, peak: 0.25, active: 0.15 };

async function compute() {
  const now = new Date();
  const period = now.toISOString().slice(0, 7);
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const daysElapsed = Math.max(1, now.getUTCDate());

  const stats = await prisma.channelStat.findMany({
    where: {
      date: { gte: from },
      channel: { status: "APPROVED", NOT: { platformId: { startsWith: "seed-" } } },
    },
    orderBy: { date: "asc" },
  });

  const byChannel = new Map<string, typeof stats>();
  for (const s of stats) {
    if (!byChannel.has(s.channelId)) byChannel.set(s.channelId, []);
    byChannel.get(s.channelId)!.push(s);
  }

  const rows = [...byChannel.entries()]
    .map(([channelId, list]) => {
      const live = list.filter((s) => s.avgViewers > 0);
      if (!live.length) return null;
      const avg = live.reduce((a, s) => a + s.avgViewers, 0) / live.length;
      const peak = Math.max(...live.map((s) => s.peakViewers));
      const active = Math.min(1, live.length / daysElapsed);
      const first = list[0].followers;
      const last = list[list.length - 1].followers;
      const growthPct = first > 0 ? ((last - first) / first) * 100 : 0;
      return { channelId, avg, peak, active, growthPct };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  if (!rows.length) {
    console.log("Reitingui trūksta duomenų (dar nėra statistikos šiam mėnesiui).");
    return;
  }

  const maxAvg = Math.log1p(Math.max(...rows.map((r) => r.avg)));
  const maxPeak = Math.log1p(Math.max(...rows.map((r) => r.peak)));

  const ranked = rows
    .map((r) => ({
      ...r,
      score:
        100 *
        (W.avg * (maxAvg ? Math.log1p(r.avg) / maxAvg : 0) +
          W.peak * (maxPeak ? Math.log1p(r.peak) / maxPeak : 0) +
          W.active * r.active),
    }))
    .sort((a, b) => b.score - a.score);

  await prisma.$transaction([
    prisma.ranking.deleteMany({ where: { period } }),
    prisma.ranking.createMany({
      data: ranked.map((r, i) => ({
        channelId: r.channelId,
        period,
        rank: i + 1,
        score: Math.round(r.score * 10) / 10,
        growthPct: Math.round(r.growthPct * 10) / 10,
      })),
    }),
  ]);

  console.log(`[${new Date().toLocaleTimeString("lt-LT")}] Reitingas ${period}: ${ranked.length} kanalų`);
}

async function run() {
  try {
    await compute();
  } catch (e) {
    console.error("Reitingo skaičiavimo klaida:", e);
  }
}

async function main() {
  if (process.argv.includes("--loop")) {
    await run();
    setInterval(run, 60 * 60_000); // kas valandą
  } else {
    await run();
    await prisma.$disconnect();
  }
}
main();
