import { PrismaClient, Platform } from "@prisma/client";

try {
  process.loadEnvFile();
} catch {
  /* .env nerastas */
}

const prisma = new PrismaClient();
const DAYS = 5; // po kiek dienų be transliacijų kanalas pašalinamas

async function expire() {
  const now = new Date();
  const day = (offset: number) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + offset));
  const cutoff = day(-DAYS);
  const yesterday = day(-1);
  let total = 0;

  for (const platform of ["TWITCH", "KICK", "YOUTUBE"] as Platform[]) {
    // Apsauga: jei šios platformos workeris nedirbo paskutinę parą, negalime teisingai nuspręsti – praleidžiame
    const fresh = await prisma.channelStat.count({ where: { date: { gte: yesterday }, channel: { platform } } });
    if (!fresh) {
      console.log(`${platform}: workeris neveikė paskutinę parą, galiojimas netikrinamas`);
      continue;
    }

    const channels = await prisma.channel.findMany({
      where: {
        platform, status: "APPROVED", activatedAt: { lt: cutoff },
        NOT: { platformId: { startsWith: "seed-" } },
      },
      select: {
        id: true, login: true,
        stats: {
          where: { OR: [{ avgViewers: { gt: 0 } }, { peakViewers: { gt: 0 } }] },
          orderBy: { date: "desc" }, take: 1, select: { date: true },
        },
      },
    });

    const gone = channels.filter((c) => !c.stats[0] || c.stats[0].date < cutoff);
    if (gone.length) {
      const ids = gone.map((c) => c.id);
      await prisma.channel.updateMany({ where: { id: { in: ids } }, data: { status: "EXPIRED" } });
      await prisma.liveStream.updateMany({ where: { channelId: { in: ids } }, data: { isLive: false, viewers: 0 } });
      console.log(`${platform}: pašalinta ${gone.length} (${gone.map((c) => c.login).join(", ")})`);
    }
    total += gone.length;
  }
  console.log(`[${new Date().toLocaleTimeString("lt-LT")}] Galiojimo patikra baigta, pašalinta: ${total}`);
}

async function run() {
  try {
    await expire();
  } catch (e) {
    console.error("Galiojimo patikros klaida:", e);
  }
}

async function main() {
  if (process.argv.includes("--loop")) {
    await run();
    setInterval(run, 60 * 60_000);
  } else {
    await run();
    await prisma.$disconnect();
  }
}
main();
