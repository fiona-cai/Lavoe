import { NextResponse } from "next/server";
import { beatovenTaskStatus } from "@/lib/beatovenClient";
import {
  encodeTrackRef,
  type CatalogTrack,
} from "@/lib/beatovenTracks";

export const maxDuration = 60;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

export async function GET(request: Request) {
  const taskId = new URL(request.url).searchParams.get("task_id");
  if (!taskId) {
    return NextResponse.json({ error: "Missing task_id" }, { status: 400 });
  }

  try {
    const taskData = asRecord(await beatovenTaskStatus(taskId));
    const status = String(
      taskData.status || taskData.state || "unknown"
    ).toLowerCase();

    if (
      status === "running" ||
      status === "composing" ||
      status === "pending" ||
      status === "progress"
    ) {
      return NextResponse.json({
        status: status === "pending" || status === "progress" ? "composing" : status,
      });
    }

    const meta = asRecord(taskData.meta);
    const trackUrl = String(
      meta.track_url || meta.download_url || taskData.track_url || ""
    );
    const composed =
      status === "composed" ||
      status === "success" ||
      Boolean(trackUrl && (status === "completed" || status === "finished"));

    if (composed && trackUrl) {
      const createdAt = new Date().toISOString();
      const mainId = encodeTrackRef({
        url: trackUrl,
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

      const stemsUrl = asRecord(meta.stems_url || meta.stems);
      for (const [stemType, stemUrl] of Object.entries(stemsUrl)) {
        if (typeof stemUrl !== "string" || !stemUrl) continue;
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
