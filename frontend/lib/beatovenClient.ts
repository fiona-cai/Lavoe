import dns from "node:dns";

dns.setDefaultResultOrder("ipv4first");

const BASES = [
  "https://public-api.beatoven.ai",
  "https://sync.beatoven.ai",
];

type Json = Record<string, unknown>;

function apiKey() {
  const key = process.env.BEATOVEN_API_KEY;
  if (!key) throw new Error("BEATOVEN_API_KEY is not configured");
  return key;
}

function authHeaders() {
  const key = apiKey();
  return [
    {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    {
      Authorization: `api_key ${key}`,
      "Content-Type": "application/json",
    },
  ];
}

async function parseBody(response: Response) {
  const text = await response.text();
  try {
    return { text, json: JSON.parse(text) as Json };
  } catch {
    return { text, json: null };
  }
}

export async function beatovenCompose(prompt: string, format = "mp3", looping = false) {
  const payload = JSON.stringify({
    prompt: { text: prompt },
    format,
    looping,
  });
  const attempts: string[] = [];

  for (const base of BASES) {
    for (const headers of authHeaders()) {
      const url = `${base}/api/v1/tracks/compose`;
      try {
        const response = await fetch(url, {
          method: "POST",
          headers,
          body: payload,
          cache: "no-store",
        });
        const { text, json } = await parseBody(response);
        if (response.ok && json) return json;
        attempts.push(`${url} -> ${response.status} ${text.slice(0, 180)}`);
      } catch (error) {
        const cause = (error as Error & { cause?: unknown }).cause;
        attempts.push(
          `${url} -> ${error instanceof Error ? error.message : String(error)}${
            cause instanceof Error ? ` (${cause.message})` : ""
          }`
        );
      }
    }
  }

  throw new Error(attempts.join(" | ") || "Beatoven compose failed");
}

export async function beatovenTaskStatus(taskId: string) {
  const paths = [`/api/v1/tasks/${taskId}`, `/api/v1/status/${taskId}`];
  const attempts: string[] = [];

  for (const base of BASES) {
    for (const path of paths) {
      for (const headers of authHeaders()) {
        const url = `${base}${path}`;
        try {
          const response = await fetch(url, {
            headers,
            cache: "no-store",
          });
          const { text, json } = await parseBody(response);
          if (response.ok && json) return json;
          attempts.push(`${url} -> ${response.status} ${text.slice(0, 180)}`);
        } catch (error) {
          const cause = (error as Error & { cause?: unknown }).cause;
          attempts.push(
            `${url} -> ${error instanceof Error ? error.message : String(error)}${
              cause instanceof Error ? ` (${cause.message})` : ""
            }`
          );
        }
      }
    }
  }

  throw new Error(attempts.join(" | ") || "Beatoven status failed");
}
