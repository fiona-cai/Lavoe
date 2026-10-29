import { NextResponse } from "next/server";
import { decodeTrackRef } from "@/lib/beatovenTracks";
import { getPremadeTrack } from "@/lib/premadeTracks";

export async function GET(
  _request: Request,
  { params }: { params: { trackId: string } }
) {
  const trackId = decodeURIComponent(params.trackId);
  const premade = getPremadeTrack(trackId);
  if (premade) {
    return NextResponse.json({
      url: premade.url,
      filename: premade.filename,
    });
  }

  const ref = decodeTrackRef(trackId);
  if (!ref) {
    return NextResponse.json({ error: "Track not found" }, { status: 404 });
  }

  return NextResponse.json({
    url: `/api/tracks/${encodeURIComponent(trackId)}/file`,
    filename: ref.filename,
  });
}
