import { apiClient, fail, fromDb, keyHash, ok, unauthorized } from "@/lib/api";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const hash = keyHash(request);
  if (!hash) return unauthorized();
  const { id } = await ctx.params;
  if (!UUID.test(id)) return fail(422, "validation_error", "id inválido.");
  const { data, error } = await apiClient().rpc("api_get_animal", { p_hash: hash, p_id: id });
  if (error) return fromDb(error);
  return ok(data);
}
