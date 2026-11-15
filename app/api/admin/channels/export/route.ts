import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/session";

export const dynamic = "force-dynamic";

const esc = (v: unknown) => {
  const s = v === null || v === undefined ? "" : v instanceof Date ? v.toISOString() : String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// GET /api/admin/channels/export -> visų kanalų CSV
export async function GET() {
  if (!(await requireAdmin())) return new Response("Forbidden", { status: 403 });
  const rows = await prisma.channel.findMany({ orderBy: { createdAt: "desc" }, take: 5000 });
  const head = ["id", "platforma", "login", "pavadinimas", "statusas", "patvirtintas", "sekejai", "pridetas", "aktyvuotas", "nuoroda", "pastaba"];
  const lines = [head.join(",")].concat(
    rows.map((c) =>
      [c.id, c.platform, c.login, c.displayName, c.status, c.verified, c.followers, c.createdAt, c.activatedAt, c.url, c.adminNote].map(esc).join(",")
    )
  );
  return new Response("\uFEFF" + lines.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="kanalai-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
