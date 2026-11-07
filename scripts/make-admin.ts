import { PrismaClient } from "@prisma/client";

try {
  process.loadEnvFile();
} catch {
  /* .env nerastas */
}

const prisma = new PrismaClient();

// npm run make-admin                      -> parodo visus vartotojus
// npm run make-admin -- "Vardas"          -> padaro administratoriumi
// npm run make-admin -- "Vardas" --remove -> atšaukia administratoriaus teises
async function main() {
  const remove = process.argv.includes("--remove");
  const names = process.argv.slice(2).filter((a) => !a.startsWith("--"));

  if (!names.length) {
    const users = await prisma.user.findMany({ include: { accounts: true }, orderBy: { createdAt: "asc" } });
    console.log(`\nVartotojai (${users.length}):`);
    for (const u of users) {
      console.log(`  - ${u.displayName} [${u.accounts.map((a) => a.provider).join(", ")}]${u.isAdmin ? "  <- ADMIN" : ""}`);
    }
    console.log('\nPadaryti administratoriumi: npm run make-admin -- "Vardas"\n');
  } else {
    for (const n of names) {
      const found = await prisma.user.findMany({ where: { displayName: { equals: n, mode: "insensitive" } } });
      if (!found.length) {
        console.log(`Nerasta: ${n} (pirmiausia prisijunkite svetainėje, tada bandykite dar kartą)`);
      } else if (found.length > 1) {
        console.log(`Rasta kelių vartotojų vardu „${n}“. Patikslinkite, kuris iš jų: paleiskite komandą be vardo, kad pamatytumėte sąrašą.`);
      } else {
        await prisma.user.update({ where: { id: found[0].id }, data: { isAdmin: !remove } });
        console.log(remove ? `Administratoriaus teisės atšauktos: ${n}` : `Dabar administratorius: ${n}`);
      }
    }
  }
  await prisma.$disconnect();
}
main();
