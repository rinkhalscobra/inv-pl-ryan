import OpenAI from "openai";

const required = ["VENICE_API_KEY", "VENICE_BASE_URL", "VENICE_MODEL"];
const missing = required.filter((name) => !process.env[name]);

if (missing.length > 0) {
  throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
}

const client = new OpenAI({
  apiKey: process.env.VENICE_API_KEY,
  baseURL: process.env.VENICE_BASE_URL,
});

const completion = await client.chat.completions.create({
  model: process.env.VENICE_MODEL,
  messages: [
    {
      role: "user",
      content: "Reply with only: Venice API connected.",
    },
  ],
});

const reply = completion.choices[0]?.message?.content?.trim();
if (!reply) throw new Error("Venice returned an empty chat completion");

console.log(`Venice connection OK (${completion.model})`);
console.log(reply);
