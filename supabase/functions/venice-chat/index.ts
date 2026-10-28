import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.39.0";
import OpenAI, {
  type ChatCompletionMessageParam,
} from "npm:openai@7.45.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, apikey, content-type, x-client-info",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });

const allowedRoles = new Set(["system", "user", "assistant"]);

function normalizeMessages(value: unknown): ChatCompletionMessageParam[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > 32) {
    return null;
  }

  let totalCharacters = 0;
  const messages: ChatCompletionMessageParam[] = [];

  for (const valueMessage of value) {
    if (!valueMessage || typeof valueMessage !== "object") return null;
    const { role, content } = valueMessage as Record<string, unknown>;
    if (
      typeof role !== "string" ||
      !allowedRoles.has(role) ||
      typeof content !== "string" ||
      content.length === 0 ||
      content.length > 12_000
    ) {
      return null;
    }

    totalCharacters += content.length;
    if (totalCharacters > 40_000) return null;
    messages.push({
      role: role as "system" | "user" | "assistant",
      content,
    });
  }

  return messages;
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const apiKey = Deno.env.get("VENICE_API_KEY") || "";
    const baseURL = Deno.env.get("VENICE_BASE_URL") ||
      "https://api.venice.ai/api/v1";
    const model = Deno.env.get("VENICE_MODEL") || "zai-org-glm-5-2";

    if (!supabaseUrl || !serviceRoleKey || !apiKey) {
      return json({ error: "Server configuration is incomplete" }, 500);
    }

    const authorization = request.headers.get("Authorization") || "";
    if (!authorization.startsWith("Bearer ")) {
      return json({ error: "Authentication required" }, 401);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userResult, error: userError } = await admin.auth.getUser(
      authorization.slice("Bearer ".length),
    );
    if (userError || !userResult.user) {
      return json({ error: "Invalid session" }, 401);
    }

    const body = await request.json().catch(() => null) as Record<
      string,
      unknown
    > | null;
    const messages = normalizeMessages(body?.messages);
    if (!messages) {
      return json({ error: "Supply 1-32 valid text chat messages" }, 400);
    }

    const requestedTemperature = Number(body?.temperature);
    const temperature = Number.isFinite(requestedTemperature)
      ? Math.min(2, Math.max(0, requestedTemperature))
      : undefined;
    const requestedMaxTokens = Number(body?.max_completion_tokens);
    const maxCompletionTokens = Number.isFinite(requestedMaxTokens)
      ? Math.min(2_048, Math.max(1, Math.trunc(requestedMaxTokens)))
      : 1_024;

    const client = new OpenAI({ apiKey, baseURL });
    const completion = await client.chat.completions.create({
      model,
      messages,
      max_completion_tokens: maxCompletionTokens,
      ...(temperature === undefined ? {} : { temperature }),
    });

    return json(completion);
  } catch (error) {
    if (error instanceof OpenAI.APIError) {
      console.error("Venice API request failed", error.status, error.code);
      return json(
        {
          error: error.status === 429
            ? "Venice rate limit reached"
            : "Venice request failed",
        },
        error.status === 429 ? 429 : 502,
      );
    }

    console.error("Venice chat function failed", error);
    return json({ error: "Venice request failed" }, 500);
  }
});
