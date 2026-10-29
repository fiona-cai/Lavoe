import type { CatalogTrack } from "./beatovenTracks";

export type PremadeTrack = CatalogTrack & {
  url: string;
  premade: true;
};

export const PREMADE_TRACKS: PremadeTrack[] = [
  {
    track_id: "premade_lofi_drums",
    filename: "Lofi Drums.wav",
    file_size: 940844,
    created_at: "2026-10-29T00:00:00.000Z",
    duration_seconds: 10.67,
    sample_rate: 44100,
    channels: 1,
    processing_type: "beatoven_stem_percussion",
    url: "/catalog/lofi-drums.wav",
    premade: true,
  },
  {
    track_id: "premade_warm_bass",
    filename: "Warm Bass.wav",
    file_size: 940844,
    created_at: "2026-10-29T00:00:00.000Z",
    duration_seconds: 10.67,
    sample_rate: 44100,
    channels: 1,
    processing_type: "beatoven_stem_bass",
    url: "/catalog/warm-bass.wav",
    premade: true,
  },
  {
    track_id: "premade_rhodes_chords",
    filename: "Rhodes Chords.wav",
    file_size: 940844,
    created_at: "2026-10-29T00:00:00.000Z",
    duration_seconds: 10.67,
    sample_rate: 44100,
    channels: 1,
    processing_type: "beatoven_stem_chords",
    url: "/catalog/rhodes-chords.wav",
    premade: true,
  },
  {
    track_id: "premade_airy_melody",
    filename: "Airy Melody.wav",
    file_size: 940844,
    created_at: "2026-10-29T00:00:00.000Z",
    duration_seconds: 10.67,
    sample_rate: 44100,
    channels: 1,
    processing_type: "beatoven_stem_melody",
    url: "/catalog/airy-melody.wav",
    premade: true,
  },
];

export function getPremadeTrack(trackId: string) {
  return PREMADE_TRACKS.find((track) => track.track_id === trackId);
}

export function isPremadeTrackId(trackId: string) {
  return trackId.startsWith("premade_");
}
