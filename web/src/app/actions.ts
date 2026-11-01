"use server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// Guarda a fazenda ativa. O cookie é só preferência: o acesso aos dados continua sendo
// decidido pelo banco (RLS), então um valor adulterado não dá acesso a nada.
export async function selectFarm(formData: FormData) {
  const id = String(formData.get("farm") ?? "");
  const supabase = await createClient();
  const { data } = await supabase.from("farms").select("id").eq("id", id).maybeSingle();
  if (!data) return;
  (await cookies()).set("farm_id", data.id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
  });
  revalidatePath("/", "layout");
}
