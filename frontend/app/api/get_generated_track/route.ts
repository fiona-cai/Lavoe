import { NextResponse } from "next/server";
import {
  beatovenHeaders,
  encodeTrackRef,
  type CatalogTrack,
} from "@/lib/beatovenTracks";

export const maxDuration = 60;

export async function GET(request: Request) {
  const taskId = new URL(request.url).searchParams.get("task_id");
  if (!taskId) {
    return NextResponse.json({ error: "Missing task_id" }, { status: 400 });
  }

  try {
    const response = await fetch(
      `https://public-api.beatoven.ai/api/v1/tasks/${taskId}`,
      { headers: beatovenHeaders() }
    );
    const taskData = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        { error: "Beatoven status failed", detail: taskData },
        { status: response.status }
      );
    }

    const status = taskData?.status || "unknown";
    if (status === "running" || status === "composing") {
      return NextResponse.json({ status });
    }

    if (status === "composed" && taskData?.meta?.track_url) {
      const meta = taskData.meta;
      const createdAt = new Date().toISOString();
      const mainId = encodeTrackRef({
        url: meta.track_url,
        filename: `beatoven_track_${taskId}.mp3`,
        processing_type: "beatoven_main_track",
      });

      const stems: Record<string, string> = {};
      const catalog: CatalogTrack[] = [
        {
          track_id: mainId,
          filename: `beatoven_track_${taskId}.mp3`,
          file_size: 0,
          created_at: createdAt,
          processing_type: "beatoven_main_track",
        },
      ];

      for (const [stemType, stemUrl] of Object.entries(
        (meta.stems_url || {}) as Record<string, string>
      )) {
        if (!stemUrl) continue;
        const stemId = encodeTrackRef({
          url: stemUrl,
          filename: `beatoven_${stemType}_${taskId}.mp3`,
          processing_type: `beatoven_stem_${stemType}`,
        });
        stems[stemType] = stemId;
        catalog.push({
          track_id: stemId,
          filename: `beatoven_${stemType}_${taskId}.mp3`,
          file_size: 0,
          created_at: createdAt,
          processing_type: `beatoven_stem_${stemType}`,
        });
      }

      return NextResponse.json({
        status: "composed",
        track_id: mainId,
        stems,
        catalog,
        metadata: {
          project_id: meta.project_id,
          beatoven_track_id: meta.track_id,
          prompt: meta.prompt || {},
        },
      });
    }

    return NextResponse.json({ status });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to check track status";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
