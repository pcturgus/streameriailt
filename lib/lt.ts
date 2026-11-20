// Spėja, ar pavadinimas / žymos yra lietuviški (kai platforma neleidžia filtruoti pagal kalbą).
// Tai spėjimas pagal tekstą, ne garantija – klaidingus kanalus galima pašalinti admin skydelyje.
export function looksLithuanian(text: string, tags: string[] = []): boolean {
  const t = text.toLowerCase();
  if (/[ėįų]/.test(t)) return true; // raidės, būdingos būtent lietuvių kalbai
  if (/lietuv/.test(t)) return true; // lietuviškai, Lietuva, lietuvių...
  return tags.some((x) => /^(lietuv|lithuan)/i.test(x) || x.toLowerCase() === "lt");
}
