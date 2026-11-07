import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS", "Content-Type": "application/json" };
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: cors });
  try {
    const auth = req.headers.get("Authorization") || "";
    const url = Deno.env.get("SUPABASE_URL")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(url, service, { auth: { persistSession: false } });
    const token = auth.replace(/^Bearer\s+/i, "");
    const { data: caller, error: authError } = await admin.auth.getUser(token);
    if (authError || !caller.user) return new Response(JSON.stringify({ error: "Sign in required." }), { status: 401, headers: cors });
    const { data: role } = await admin.from("admin_users").select("role,is_active").eq("user_id", caller.user.id).maybeSingle();
    if (role?.role !== "owner" || !role.is_active) return new Response(JSON.stringify({ error: "Owner access required." }), { status: 403, headers: cors });
    const body = await req.json();
    const email = String(body.email || "").trim().toLowerCase();
    const fullName = String(body.full_name || "").trim().slice(0,120);
    const accountRole = String(body.role || "");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !fullName || !["manager","sales_executive"].includes(accountRole)) return new Response(JSON.stringify({ error: "Provide a valid email, name, and non-owner role." }), { status: 400, headers: cors });
    const siteUrl = Deno.env.get("SITE_URL");
    const inviteOptions = { data: { full_name: fullName }, ...(siteUrl ? { redirectTo: siteUrl.replace(/\/$/, "") + "/admin/login.html" } : {}) };
    const { data: invite, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, inviteOptions);
    if (inviteError || !invite.user) throw inviteError || new Error("Invitation failed.");
    const { error } = await admin.from("admin_users").insert({ user_id: invite.user.id, email, full_name: fullName, role: accountRole, is_active: true });
    if (error) {
      await admin.auth.admin.deleteUser(invite.user.id);
      throw error;
    }
    return new Response(JSON.stringify({ ok: true, user_id: invite.user.id }), { status: 200, headers: cors });
  } catch (error) {
    console.error("admin-invite failed", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Invitation failed." }), { status: 500, headers: cors });
  }
});
