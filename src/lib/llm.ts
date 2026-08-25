const GEMINI_OPENAI_BASE = "https://generativelanguage.googleapis.com/v1beta/openai";

export function llmAvailable(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

/**
 * Minimal OpenAI-compatible chat call (works with Gemini's free-tier compat endpoint).
 * Returns null on any failure — LLM is garnish, never a dependency.
 */
export async function chat(
  system: string,
  user: string,
  maxTokens = 300
): Promise<string | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 12000);
    const res = await fetch(`${GEMINI_OPENAI_BASE}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: "gemini-2.0-flash",
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        max_tokens: maxTokens,
        temperature: 0.4,
      }),
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (!res.ok) return null;
    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    return json.choices?.[0]?.message?.content ?? null;
  } catch {
    return null;
  }
}
