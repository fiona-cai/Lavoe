import { NextResponse } from "next/server";
import { beatovenCompose } from "@/lib/beatovenClient";

export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const prompt = body?.prompt?.text || body?.prompt || "";
    const data = await beatovenCompose(
      String(prompt),
      body?.format || "mp3",
      Boolean(body?.looping)
    );
    return NextResponse.json(data);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to start generation";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
