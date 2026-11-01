import { apiClient, fail, fromDb, keyHash, ok, unauthorized } from "@/lib/api";

export async function GET(request: Request) {
  const hash = keyHash(request);
  if (!hash) return unauthorized();
  const u = new URL(request.url);
  const limit = Number(u.searchParams.get("limit") ?? "50");
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) return fail(422, "validation_error", "limit deve ser de 1 a 200.");
  const { data, error } = await apiClient().rpc("api_list_animals", {
    p_hash: hash,
    p_status: u.searchParams.get("status"),
    p_limit: limit,
    p_after: u.searchParams.get("cursor"),
  });
  if (error) return fromDb(error);
  return ok(data);
}
