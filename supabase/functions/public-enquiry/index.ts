import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS", "Content-Type": "application/json" };
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: cors });
  try {
    const length = Number(req.headers.get("content-length") || 0);
    if (length > 12000) return new Response(JSON.stringify({ error: "Enquiry is too large." }), { status: 413, headers: cors });
    const body = await req.json();
    if (typeof body.website !== "string" || body.website.trim()) return new Response(JSON.stringify({ ok: true }), { status: 200, headers: cors });
    const name = String(body.name || "").trim().slice(0,120);
    const phone = String(body.phone || "").replace(/[^0-9+]/g, "").slice(0,20);
    const email = String(body.email || "").trim().slice(0,254);
    const message = String(body.message || "").trim().slice(0,2000);
    if (name.length < 2 || phone.replace(/\D/g, "").length < 7 || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) return new Response(JSON.stringify({ error: "Enter a valid name, phone number, and email." }), { status: 400, headers: cors });
    const url = Deno.env.get("SUPABASE_URL")!;
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const db = createClient(url, key, { auth: { persistSession: false } });
    const ip = req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const { data: allowed, error: limitError } = await db.rpc("claim_public_enquiry", { client_ip: ip });
    if (limitError) throw limitError;
    if (!allowed) return new Response(JSON.stringify({ error: "Too many enquiries. Please try again later or call our team." }), { status: 429, headers: cors });
    let propertyId = typeof body.property_id === "string" && /^[0-9a-f-]{36}$/i.test(body.property_id) ? body.property_id : null;
    if (propertyId) {
      const { data: listing } = await db.from("properties").select("id").eq("id", propertyId).eq("status", "published").maybeSingle();
      if (!listing) propertyId = null;
    }
    const { error } = await db.from("leads").insert({
      full_name: name, phone, email: email || null, source: "Website",
      interested_in: String(body.interested_in || "Any property").slice(0,160), property_type: String(body.property_type || "").slice(0,100) || null,
      preferred_location: String(body.preferred_location || "").slice(0,160) || null,
      notes: message || null, property_id: propertyId, priority: "Warm", status: "New"
    });
    if (error) throw error;
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: cors });
  } catch (error) {
    console.error("public-enquiry failed", error);
    return new Response(JSON.stringify({ error: "We could not save your enquiry. Please contact us by phone or WhatsApp." }), { status: 500, headers: cors });
  }
});
