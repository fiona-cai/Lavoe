export type CatalogTrack = {
  track_id: string;
  filename: string;
  file_size: number;
  created_at: string;
  processing_type?: string;
};

export type EncodedTrack = {
  url: string;
  filename: string;
  processing_type: string;
};

export function encodeTrackRef(track: EncodedTrack): string {
  return `b64_${Buffer.from(JSON.stringify(track), "utf8").toString("base64url")}`;
}

export function decodeTrackRef(trackId: string): EncodedTrack | null {
  if (!trackId.startsWith("b64_")) return null;
  try {
    return JSON.parse(
      Buffer.from(trackId.slice(4), "base64url").toString("utf8")
    ) as EncodedTrack;
  } catch {
    return null;
  }
}

export function beatovenHeaders() {
  const key = process.env.BEATOVEN_API_KEY;
  if (!key) {
    throw new Error("BEATOVEN_API_KEY is not configured");
  }
  return {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
}
