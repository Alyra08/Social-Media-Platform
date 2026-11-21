import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { reports } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";

const csvCell = (v: unknown) => {
  const s = v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
  // Guard against spreadsheet formula injection.
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
};

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getCurrentUser())) return new Response("Unauthorised", { status: 401 });
  const { id } = await params;
  const r = await (await getDb()).query.reports.findFirst({ where: eq(reports.id, id) });
  if (!r) return new Response("Not found", { status: 404 });
  const format = new URL(req.url).searchParams.get("format") ?? "json";
  const name = `sbf-${r.kind}-${r.periodEnd}`;
  if (format === "csv") {
    const d = r.data as { top?: Record<string, unknown>[]; bottom?: Record<string, unknown>[]; insights?: string[]; totals?: Record<string, number> };
    const lines: string[] = [];
    lines.push("section,key,value");
    for (const [k, v] of Object.entries(d.totals ?? {})) lines.push(["totals", k, v].map(csvCell).join(","));
    for (const i of d.insights ?? []) lines.push(["insight", "", i].map(csvCell).join(","));
    const rows = [...(d.top ?? []), ...(d.bottom ?? [])];
    if (rows.length) {
      const cols = Object.keys(rows[0]);
      lines.push("", cols.map(csvCell).join(","));
      for (const row of rows) lines.push(cols.map((c) => csvCell(row[c])).join(","));
    }
    return new Response(lines.join("\n"), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}.csv"` } });
  }
  return new Response(JSON.stringify(r, null, 2), { headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="${name}.json"` } });
}
