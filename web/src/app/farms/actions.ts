"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function createFarm(formData: FormData) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("create_organization_with_farm", {
    p_org_name: String(formData.get("org") ?? "").trim(),
    p_farm_code: String(formData.get("code") ?? "").trim(),
    p_farm_name: String(formData.get("name") ?? "").trim(),
  });
  if (error) redirect(`/farms?erro=${error.message.includes("already_has_access") ? "acesso" : "1"}`);
  revalidatePath("/", "layout");
  redirect("/farms");
}

export async function createFarmInOrg(formData: FormData) {
  const org = String(formData.get("org_id") ?? "");
  if (!UUID.test(org)) redirect("/farms?erro=1");
  const supabase = await createClient();
  const { error } = await supabase.rpc("create_farm_in_org", {
    p_org: org,
    p_code: String(formData.get("code") ?? "").trim(),
    p_name: String(formData.get("name") ?? "").trim(),
  });
  if (error) redirect(`/farms?erro=${error.code === "42501" ? "perm" : "1"}`);
  revalidatePath("/", "layout");
  redirect("/farms?ok=1");
}

const num = (v: string | null) => (v === null ? null : Number(v.replace(",", ".")));
const gg = (f: FormData, k: string) => {
  const v = String(f.get(k) ?? "").trim();
  return v === "" ? null : v;
};

export async function updateFarm(formData: FormData) {
  const supabase = await createClient();
  const id = String(formData.get("id") ?? "");
  const state = gg(formData, "state")?.toUpperCase() ?? null;
  const lat = num(gg(formData, "latitude"));
  const lng = num(gg(formData, "longitude"));
  const area = num(gg(formData, "area_ha"));
  if (!UUID.test(id) || (state && !/^[A-Z]{2}$/.test(state)) || [lat, lng, area].some((n) => n !== null && !Number.isFinite(n))) {
    redirect("/farms?erro=dados");
  }
  const { data, error } = await supabase.from("farms").update({
    name: gg(formData, "name"), legal_name: gg(formData, "legal_name"), tax_id: gg(formData, "tax_id"),
    state_registration: gg(formData, "state_registration"), address: gg(formData, "address"), city: gg(formData, "city"),
    state, latitude: lat, longitude: lng, area_ha: area, notes: gg(formData, "notes"),
  }).eq("id", id).select("id");
  if (error) redirect("/farms?erro=dados");
  if (!data || data.length === 0) redirect("/farms?erro=perm");
  revalidatePath("/", "layout");
  redirect("/farms?ok=dados");
}
