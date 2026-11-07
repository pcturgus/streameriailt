import { PrismaClient } from "@prisma/client";

try {
  process.loadEnvFile();
} catch {
  /* .env nerastas */
}

const prisma = new PrismaClient();

// npm run remove -- kanalo_vardas            -> pašalina iš katalogo (kanalas gali būti pridėtas iš naujo)
// npm run remove -- kanalo_vardas --block    -> užblokuoja (pridėti iš naujo nebegalės)
async function main() {
  const block = process.argv.includes("--block");
  const names = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  if (!names.length) {
    console.log("Naudojimas: npm run remove -- kanalo_vardas [--block]");
    return;
  }
  for (const n of names) {
    const found = await prisma.channel.findMany({ where: { login: { equals: n, mode: "insensitive" } }, select: { id: true } });
    if (!found.length) {
      console.log("Nerasta:", n);
      continue;
    }
    const ids = found.map((c) => c.id);
    await prisma.channel.updateMany({ where: { id: { in: ids } }, data: { status: block ? "REJECTED" : "EXPIRED" } });
    await prisma.liveStream.updateMany({ where: { channelId: { in: ids } }, data: { isLive: false, viewers: 0 } });
    console.log(block ? `Užblokuota: ${n}` : `Pašalinta: ${n}`);
  }
  await prisma.$disconnect();
}
main();
