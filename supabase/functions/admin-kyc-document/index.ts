import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.39.0";
import { isAllowedAdminIp } from "../../../src/constants/adminIpAllowlist.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
};
const errorResponse = (message: string, status: number) => new Response(JSON.stringify({ error: message }), {
  status,
  headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
});

Deno.serve(async request => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST") return errorResponse("Method not allowed", 405);
  if (!isAllowedAdminIp(request.headers.get("cf-connecting-ip"))) {
    return errorResponse("Administrator network access required", 403);
  }
  const token = request.headers.get("Authorization")?.replace(/^Bearer /i, "");
  if (!token) return errorResponse("Authentication required", 401);
  const url = Deno.env.get("SUPABASE_URL"), key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return errorResponse("Server configuration is incomplete", 500);
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: actor, error: authError } = await admin.auth.getUser(token);
  if (authError || !actor.user) return errorResponse("Invalid administrator session", 401);
  const { data: profile, error: profileError } = await admin.from("users")
    .select("is_admin").eq("id", actor.user.id).single();
  if (profileError || profile?.is_admin !== true) return errorResponse("Administrator access required", 403);
  const body = await request.json().catch(() => ({})) as { path?: string };
  const path = body.path?.trim() || "";
  if (!path || path.length > 500 || path.startsWith("/") || path.includes("..") || path.includes("\\")) {
    return errorResponse("Invalid document path", 400);
  }
  const { data: document, error } = await admin.storage.from("kyc-documents").download(path);
  if (error || !document) return errorResponse("Document unavailable", 404);
  const safeTypes = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);
  const contentType = safeTypes.has(document.type) ? document.type : "application/octet-stream";
  return new Response(document, {
    headers: {
      ...cors,
      "Content-Type": contentType,
      "Content-Disposition": contentType === "application/octet-stream" ? "attachment" : "inline",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
});
