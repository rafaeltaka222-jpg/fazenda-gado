import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { getContext } from "@/lib/context";
import { parseWeighingFile } from "@/lib/importer";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_BYTES = 5 * 1024 * 1024;

export async function POST(request: Request) {
  const go = (path: string) => NextResponse.redirect(new URL(path, request.url), 303);

  // Proteção extra contra envio vindo de outro site
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (origin && host && new URL(origin).host !== host) return new NextResponse("Origem não permitida", { status: 403 });

  const ctx = await getContext();
  if (!ctx.active) return go("/farms");

  const form = await request.formData();
  const file = form.get("file");
  const layoutId = String(form.get("layout_id") ?? "");
  if (!(file instanceof File) || file.size === 0 || !UUID.test(layoutId)) return go("/import?erro=arquivo");
  if (file.size > MAX_BYTES) return go("/import?erro=grande");

  const supabase = await createClient();
  const { data: layout } = await supabase
    .from("import_layouts")
    .select("*")
    .eq("id", layoutId)
    .eq("farm_id", ctx.active.id)
    .maybeSingle();
  if (!layout) return go("/import?erro=layout");

  const buf = await file.arrayBuffer();
  const hash = createHash("sha256").update(Buffer.from(buf)).digest("hex");
  const rows = parseWeighingFile(buf, layout as any);
  if (rows.length === 0) return go("/import?erro=vazio");
  if (rows.length > 5000) return go("/import?erro=linhas");

  const { data, error } = await supabase.rpc("stage_import", {
    p_farm: ctx.active.id,
    p_layout: layoutId,
    p_file_name: file.name.slice(0, 200),
    p_file_hash: hash,
    p_rows: rows,
  });
  if (error || !data) return go(`/import?erro=${error?.code === "42501" ? "perm" : "arq"}`);
  return go(`/import/${data}`);
}
