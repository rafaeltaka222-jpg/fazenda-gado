import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Recebe o link do e-mail (recuperação de senha), troca o código por uma sessão e segue para a página indicada.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/dashboard";
  const safe = next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(safe, url.origin));
  }
  return NextResponse.redirect(new URL("/login?erro=link", url.origin));
}
