import { NextResponse } from "next/server";
import { beatovenHeaders } from "@/lib/beatovenTracks";

export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const response = await fetch(
      "https://public-api.beatoven.ai/api/v1/tracks/compose",
      {
        method: "POST",
        headers: beatovenHeaders(),
        body: JSON.stringify({
          prompt: { text: body?.prompt?.text || body?.prompt || "" },
          format: body?.format || "mp3",
          looping: Boolean(body?.looping),
        }),
      }
    );

    const text = await response.text();
    let data: unknown = text;
    try {
      data = JSON.parse(text);
    } catch {
      // keep raw text
    }

    if (!response.ok) {
      return NextResponse.json(
        { error: "Beatoven compose failed", detail: data },
        { status: response.status }
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to start generation";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
