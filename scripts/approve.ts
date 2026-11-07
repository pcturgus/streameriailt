import { PrismaClient } from "@prisma/client";

try {
  process.loadEnvFile();
} catch {
  /* .env nerastas */
}

const prisma = new PrismaClient();

async function main() {
  const names = process.argv.slice(2);

  if (!names.length) {
    const pending = await prisma.channel.findMany({ where: { status: "PENDING" }, orderBy: { createdAt: "asc" } });
    console.log(`\nLaukiantys kanalai (${pending.length}):`);
    for (const c of pending) console.log(`  - ${c.login} (${c.platform}) ${c.url}`);
    const subs = await prisma.channelSubmission.findMany({ where: { status: "PENDING" }, orderBy: { createdAt: "asc" } });
    console.log(`\nLaukiančios paraiškos (${subs.length}):`);
    for (const s of subs) console.log(`  - ${s.channelName} (${s.platform}) ${s.url}`);
    console.log('\nPatvirtinti kanalą: npm run approve -- kanalo_vardas\n');
  } else {
    for (const n of names) {
      const r = await prisma.channel.updateMany({
        where: { login: { equals: n, mode: "insensitive" } },
        data: { status: "APPROVED", activatedAt: new Date() },
      });
      console.log(r.count ? `Patvirtinta: ${n}` : `Nerasta: ${n}`);
    }
  }
  await prisma.$disconnect();
}
main();
