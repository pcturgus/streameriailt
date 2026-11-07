import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privatumo politika – Streameriai.Lt",
  description: "Kaip Streameriai.Lt renka, naudoja ir saugo jūsų duomenis.",
};

// SVARBU: prieš paleidžiant svetainę pakeiskite visus laukus, pažymėtus [SKLIAUSTELIAIS].
function H({ children }: { children: React.ReactNode }) {
  return <h2 className="text-lg font-semibold text-white mt-10 mb-3">{children}</h2>;
}
function P({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-slate-300 leading-relaxed mb-3">{children}</p>;
}
function L({ children }: { children: React.ReactNode }) {
  return <ul className="list-disc pl-5 space-y-1.5 text-sm text-slate-300 leading-relaxed mb-3">{children}</ul>;
}

export default function Privatumas() {
  return (
    <main className="min-h-screen bg-[#0B0F17] text-slate-100">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
        <a href="/" className="text-xs text-indigo-400 hover:text-indigo-300">← Grįžti į Streameriai.Lt</a>
        <h1 className="text-3xl font-extrabold text-white mt-6 mb-2">Privatumo politika</h1>
        <p className="text-xs text-slate-500 mb-8">Paskutinį kartą atnaujinta: [2026-11-06]</p>

        <H>1. Kas mes esame</H>
        <P>
          Streameriai.Lt (toliau – „svetainė“) yra Lietuvos turinio kūrėjų katalogas, kuriame rodomos gyvos Twitch, Kick ir
          YouTube transliacijos, kanalų reitingas ir klipai. Duomenų valdytojas: [JŪSŲ VARDAS, PAVARDĖ ARBA ĮMONĖS PAVADINIMAS IR KODAS],
          el. paštas: [MantasRaulinaitis@gmail.com].
        </P>

        <H>2. Kokius duomenis renkame</H>
        <P><strong className="text-slate-100">Kai prisijungiate per Twitch, Kick arba Google (YouTube):</strong></P>
        <L>
          <li>jūsų paskyros identifikatorių tame tinkle, rodomą vardą ir profilio nuotrauką;</li>
          <li>jūsų kanalo duomenis: pavadinimą, nuorodą ir (YouTube atveju) prenumeratorių skaičių.</li>
        </L>
        <P>Mes neprašome ir nesaugome jūsų slaptažodžių. Prisijungimo metu neprašome jūsų el. pašto adreso.</P>
        <P><strong className="text-slate-100">Kai pateikiate kanalo paraišką:</strong> kanalo pavadinimą, platformą ir nuorodą.</P>
        <P>
          <strong className="text-slate-100">Viešai prieinami duomenys:</strong> kanalų transliacijų informaciją (pavadinimą, kategoriją,
          žiūrovų skaičių, miniatiūrą), klipus ir statistiką gauname iš oficialių Twitch, YouTube ir Kick API ir rodome katalogo bei reitingo
          tikslais.
        </P>

        <H>3. Kam naudojame ir kokiu pagrindu</H>
        <L>
          <li>jūsų tapatybei patvirtinti ir kanalui susieti su jūsų paskyra (sutarties vykdymas / sutikimas);</li>
          <li>katalogui, reitingui ir klipų skilčiai rodyti (teisėtas interesas pateikti viešą kūrėjų informaciją);</li>
          <li>paraiškoms peržiūrėti ir svetainės saugumui užtikrinti (teisėtas interesas).</li>
        </L>

        <H>4. Google (YouTube) duomenys</H>
        <P>
          Jei prisijungiate su Google, prašome tik skaitymo prieigos prie jūsų YouTube kanalo duomenų (leidimas „youtube.readonly“). Šį leidimą
          naudojame vienintelei paskirčiai: nustatyti, kuriam YouTube kanalui jūs priklausote, ir parodyti jo pavadinimą bei prenumeratorių
          skaičių. Šių duomenų nenaudojame reklamai, neperduodame ir neparduodame trečiosioms šalims.
        </P>
        <P>
          Streameriai.Lt&nbsp;naudojimas ir perdavimas bet kuriai kitai programai informacijos, gautos iš Google API, atitiks{" "}
          <a className="text-indigo-400 underline" href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer">Google API Services User Data Policy</a>,
          įskaitant „Limited Use“ reikalavimus. (Streameriai.Lt’s use and transfer to any other app of information received from Google APIs
          will adhere to the Google API Services User Data Policy, including the Limited Use requirements.)
        </P>

        <H>5. Slapukai</H>
        <P>
          Naudojame tik būtinus slapukus: sesijos slapuką (kad liktumėte prisijungę) ir trumpalaikį slapuką prisijungimo proceso metu. Analitikos ar
          reklamos slapukų nenaudojame.
        </P>

        <H>6. Kam perduodame duomenis</H>
        <P>
          Duomenys tvarkomi tik mūsų paslaugų teikėjų: duomenų bazės ir hostingo tiekėjų (https://www.iv.lt/]). Prisijungimui ir viešiems
          duomenims naudojame Twitch, Google (YouTube) ir Kick API; jų pačių privatumo taisyklės galioja jų paslaugoms.
        </P>

        <H>7. Kiek laiko saugome</H>
        <P>
          Paskyros ir kanalo duomenis saugome tol, kol turite paskyrą svetainėje. Paprašius, juos ištrinsime. Transliacijų ir statistikos duomenys
          saugomi reitingui skaičiuoti, o klipai – ne ilgiau kaip 14 dienų.
        </P>

        <H>8. Jūsų teisės</H>
        <P>
          Turite teisę susipažinti su savo duomenimis, juos ištaisyti, ištrinti, apriboti tvarkymą, perkelti duomenis ir nesutikti su tvarkymu.
          Norėdami pasinaudoti teisėmis, rašykite [EL. PAŠTAS]. Jei manote, kad jūsų teisės pažeistos, turite teisę pateikti skundą Valstybinei
          duomenų apsaugos inspekcijai (vdai.lrv.lt).
        </P>

        <H>9. Kontaktai</H>
        <P>[Streameriai.Lt], [MantasRaulinaitis@gmail.com]</P>

        <p className="text-xs text-slate-600 mt-12 border-t border-slate-800 pt-4">
          Šis tekstas yra šablonas, paruoštas pagal faktiškai renkamus duomenis. Prieš paleidžiant svetainę viešai, pakeiskite laukus
          [SKLIAUSTELIAIS] ir, jei įmanoma, leiskite jį peržiūrėti teisininkui.
        </p>
      </div>
    </main>
  );
}
