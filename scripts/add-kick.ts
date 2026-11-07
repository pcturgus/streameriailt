import { prisma, kick } from "../lib/kick";

function slugOf(input: string): string {
  const s = input.trim();
  const m = s.match(/kick\.com\/([\w-]+)/i);
  return (m ? m[1] : s.replace(/^@/, "")).toLowerCase();
}

async function main() {
  const args = process.argv.slice(2);
  if (!args.length) {
    console.log('Naudojimas: npm run add:kick -- "https://kick.com/kanalas" kitas_kanalas');
    return;
  }
  for (const a of args) {
    const slug = slugOf(a);
    try {
      const res = await kick("/channels", [["slug", slug]]);
      const c = res.data?.[0];
      const id = c?.broadcaster_user_id ?? c?.user_id;
      if (!c || id === undefined) {
        console.error("Kanalas nerastas arba netikėtas atsakymas:", slug, JSON.stringify(res).slice(0, 300));
        continue;
      }
      const ch = await prisma.channel.upsert({
        where: { platform_platformId: { platform: "KICK", platformId: String(id) } },
        update: { login: slug, url: `https://kick.com/${slug}` },
        create: {
          platform: "KICK", platformId: String(id), login: slug, displayName: c.slug ?? slug,
          url: `https://kick.com/${slug}`, language: "lt", status: "APPROVED",
        },
      });
      console.log(`Pridėta: ${ch.displayName} (${ch.url})`);
    } catch (e) {
      console.error("Nepavyko:", a, "-", (e as Error).message);
    }
  }
  await prisma.$disconnect();
}
main();
