import { apiClient, fail, fromDb, keyHash, ok, unauthorized } from "@/lib/api";

export async function GET(request: Request) {
  const hash = keyHash(request);
  if (!hash) return unauthorized();
  const u = new URL(request.url);
  const limit = Number(u.searchParams.get("limit") ?? "50");
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) return fail(422, "validation_error", "limit deve ser de 1 a 200.");
  const { data, error } = await apiClient().rpc("api_list_weighings", { p_hash: hash, p_ear_tag: u.searchParams.get("ear_tag"), p_limit: limit });
  if (error) return fromDb(error);
  return ok(data);
}

export async function POST(request: Request) {
  const hash = keyHash(request);
  if (!hash) return unauthorized();
  const text = await request.text();
  if (text.length > 1_000_000) return fail(413, "payload_too_large", "Corpo da requisição acima de 1 MB.");
  let body: any;
  try {
    body = JSON.parse(text);
  } catch {
    return fail(400, "invalid_json", "O corpo deve ser um JSON válido.");
  }
  if (!body || !Array.isArray(body.items)) return fail(422, "validation_error", 'Envie {"items": [...]}.');
  const idem = request.headers.get("idempotency-key");
  const { data, error } = await apiClient().rpc("api_register_weighings", { p_hash: hash, p_items: body.items, p_idem: idem });
  if (error) return fromDb(error);
  return ok(data, 201);
}
