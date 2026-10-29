import { NextResponse } from "next/server";
import { isPremadeTrackId } from "@/lib/premadeTracks";

export async function DELETE(
  _request: Request,
  { params }: { params: { trackId: string } }
) {
  const trackId = decodeURIComponent(params.trackId);
  if (isPremadeTrackId(trackId)) {
    return NextResponse.json(
      { error: "Premade tracks cannot be deleted" },
      { status: 403 }
    );
  }
  return NextResponse.json({ ok: true });
}
