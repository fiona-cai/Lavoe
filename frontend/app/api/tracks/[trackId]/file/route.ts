import dns from "node:dns";
import { NextResponse } from "next/server";
import { decodeTrackRef } from "@/lib/beatovenTracks";

dns.setDefaultResultOrder("ipv4first");

export const maxDuration = 60;

export async function GET(
  _request: Request,
  { params }: { params: { trackId: string } }
) {
  const trackId = decodeURIComponent(params.trackId);
  const ref = decodeTrackRef(trackId);
  if (!ref) {
    return NextResponse.json({ error: "Track not found" }, { status: 404 });
  }

  const response = await fetch(ref.url);
  if (!response.ok || !response.body) {
    return NextResponse.json(
      { error: "Failed to download audio" },
      { status: 502 }
    );
  }

  return new NextResponse(response.body, {
    headers: {
      "Content-Type": response.headers.get("content-type") || "audio/mpeg",
      "Content-Disposition": `inline; filename="${ref.filename}"`,
    },
  });
}
