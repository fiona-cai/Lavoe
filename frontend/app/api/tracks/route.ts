import { NextResponse } from "next/server";
import { PREMADE_TRACKS } from "@/lib/premadeTracks";

export async function GET() {
  return NextResponse.json(
    PREMADE_TRACKS.map(({ url: _url, premade: _premade, ...track }) => track)
  );
}
