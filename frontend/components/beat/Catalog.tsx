"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Download,
  Play,
  Pause,
  Music2,
  Clock,
  FileAudio,
  RefreshCw,
  Plus,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Waveform } from "./Waveform";
import { authFetch } from "@/lib/authFetch";
import { BACKEND_URL } from "@/lib/backendUrl";

interface Track {
  track_id: string;
  filename: string;
  file_size: number;
  created_at: string;
  duration_seconds?: number;
  sample_rate?: number;
  processing_type?: string;
  channels?: number;
}

function TrackWaveform({
  trackId,
  colorClass,
}: {
  trackId: string;
  colorClass: string;
}) {
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  useEffect(() => {
    let isCancelled = false;
    const load = async () => {
      try {
        setIsLoading(true);
        const response = await authFetch(
          `${BACKEND_URL}/tracks/${encodeURIComponent(trackId)}/download`
        );
        if (!response.ok)
          throw new Error("Failed to request signed URL for waveform");
        const { url } = await response.json();
        const blobResp = await fetch(url);
        const blob = await blobResp.blob();
        if (!isCancelled) setAudioBlob(blob);
      } catch (e) {
        if (!isCancelled) {
          setAudioBlob(null);
          console.error("Waveform load error:", e);
        }
      } finally {
        if (!isCancelled) setIsLoading(false);
      }
    };
    load();
    return () => {
      isCancelled = true;
    };
  }, [trackId]);

  return (
    <div className="w-full">
      <Waveform
        audioBlob={audioBlob ?? undefined}
        width={230}
        height={40}
        color={colorClass}
        className="w-full"
      />
    </div>
  );
}

interface CatalogProps {
  tracks: Track[];
  loading: boolean;
  onAddToEditor?: (trackId: string, filename: string) => void;
  onTrackDelete?: (trackId: string) => void;
}

export default function Catalog({
  tracks,
  loading,
  onAddToEditor,
  onTrackDelete,
}: CatalogProps) {
  const [playingTrack, setPlayingTrack] = useState<string | null>(null);
  const currentAudio = useRef<HTMLAudioElement | null>(null);
  const currentAudioUrl = useRef<string | null>(null);
  const currentTrackId = useRef<string | null>(null);

  const stopCurrentAudio = () => {
    try {
      if (currentAudio.current) {
        currentAudio.current.pause();
        currentAudio.current.src = "";
        currentAudio.current.onended = null;
        currentAudio.current.onerror = null;
        currentAudio.current = null;
      }
    } finally {
      if (currentAudioUrl.current) {
        URL.revokeObjectURL(currentAudioUrl.current);
        currentAudioUrl.current = null;
      }
      currentTrackId.current = null;
    }
  };

  const pauseCurrentAudio = () => {
    if (currentAudio.current) {
      currentAudio.current.pause();
    }
  };

  const handlePlayTrack = async (trackId: string) => {
    // Toggle: if this track is currently playing, pause it
    if (playingTrack === trackId && currentAudio.current) {
      pauseCurrentAudio();
      setPlayingTrack(null);
      return;
    }

    // If this track was previously loaded (paused), resume
    if (
      currentTrackId.current === trackId &&
      currentAudio.current &&
      !currentAudio.current.ended
    ) {
      try {
        await currentAudio.current.play();
        setPlayingTrack(trackId);
        return;
      } catch (e) {
        console.error("Error resuming track:", e);
      }
    }

    // Otherwise, load and play this track
    if (currentAudio.current) {
      stopCurrentAudio();
    }

    try {
      const response = await authFetch(
        `${BACKEND_URL}/tracks/${encodeURIComponent(trackId)}/download`
      );
      if (!response.ok) {
        throw new Error("Failed to download track");
      }
      const { url: signedUrl1 } = await response.json();
      const blobResp = await fetch(signedUrl1);
      const audioBlob = await blobResp.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      currentAudio.current = audio;
      currentAudioUrl.current = audioUrl;
      currentTrackId.current = trackId;

      setPlayingTrack(trackId);

      audio.onended = () => {
        stopCurrentAudio();
        setPlayingTrack(null);
      };

      audio.onerror = () => {
        stopCurrentAudio();
        setPlayingTrack(null);
        toast.error("Failed to play track");
      };

      await audio.play();
    } catch (error) {
      console.error("Error playing track:", error);
      toast.error("Failed to play track");
      stopCurrentAudio();
      setPlayingTrack(null);
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopCurrentAudio();
    };
  }, []);

  const handleDownloadTrack = async (trackId: string, filename: string) => {
    try {
      const response = await authFetch(
        `${BACKEND_URL}/tracks/${encodeURIComponent(trackId)}/download`
      );
      if (!response.ok) {
        throw new Error("Failed to download track");
      }
      const { url: signedUrl2 } = await response.json();
      const blobResp = await fetch(signedUrl2);
      const blob = await blobResp.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success("Track downloaded successfully");
    } catch (error) {
      console.error("Error downloading track:", error);
      toast.error("Failed to download track");
    }
  };

  const handleDeleteTrack = async (trackId: string) => {
    try {
      const response = await authFetch(`${BACKEND_URL}/tracks/${encodeURIComponent(trackId)}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const msg = await response.text();
        throw new Error(msg || "Failed to delete track");
      }
      // Notify parent to update tracks list
      if (onTrackDelete) {
        onTrackDelete(trackId);
      }
      toast.success("Track removed from catalog");
    } catch (error) {
      console.error("Error deleting track:", error);
      toast.error("Failed to delete track");
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDuration = (seconds?: number) => {
    if (!seconds) return "N/A";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const getTrackTypeColor = (type?: string) => {
    switch (type) {
      case "beatoven_main_track":
        return "bg-blue-500";
      case "beatoven_stem_bass":
        return "bg-cyan-500";
      case "beatoven_stem_chords":
        return "bg-green-500";
      case "beatoven_stem_melody":
        return "bg-purple-500";
      case "beatoven_stem_percussion":
        return "bg-orange-500";
      case "harmonic_extraction":
        return "bg-pink-500";
      case "reverb":
        return "bg-yellow-500";
      default:
        return "bg-gray-500";
    }
  };

  const getTrackTypeLabel = (type?: string) => {
    switch (type) {
      case "beatoven_main_track":
        return "Main Track";
      case "beatoven_stem_bass":
        return "Bass";
      case "beatoven_stem_chords":
        return "Chords";
      case "beatoven_stem_melody":
        return "Melody";
      case "beatoven_stem_percussion":
        return "Percussion";
      case "harmonic_extraction":
        return "Harmonic";
      case "reverb":
        return "Reverb";
      case "original_upload":
        return "Upload";
      default:
        return "Audio";
    }
  };

  return (
    <div className="flex flex-col h-full max-h-full overflow-hidden">
      <div className="flex-shrink-0 p-4 border-b border-border">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Catalog Tracks</h3>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden">
        <ScrollArea className="h-full">
          <div className="p-4">
            {loading ? (
              <div className="flex items-center justify-center h-32">
                <div className="text-center">
                  <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">
                    Loading tracks...
                  </p>
                </div>
              </div>
            ) : tracks.length === 0 ? (
              <div className="flex items-center justify-center h-32">
                <div className="text-center">
                  <Music2 className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    No tracks available
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {tracks.map((track) => (
                  <Card key={track.track_id} className="bg-card relative">
                    {!track.track_id.startsWith("premade_") && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-muted-foreground hover:text-red-400 absolute top-2 right-2 z-10"
                        onClick={() => handleDeleteTrack(track.track_id)}
                        title="Remove from catalog"
                        aria-label="Remove from catalog"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0 overflow-hidden">
                          <CardTitle
                            className="block max-w-[230px] text-sm font-medium truncate whitespace-nowrap overflow-hidden text-ellipsis"
                            title={track.filename}
                          >
                            {track.filename}
                          </CardTitle>
                          {/* Waveform replaces ID display */}
                          <div className="mt-3 overflow-hidden">
                            <TrackWaveform
                              trackId={track.track_id}
                              colorClass={getTrackTypeColor(
                                track.processing_type
                              )}
                            />
                          </div>
                          {track.processing_type &&
                            getTrackTypeLabel(track.processing_type) !==
                              "Audio" && (
                              <div className="flex items-center gap-2 mt-1">
                                <Badge
                                  className={`text-xs ${getTrackTypeColor(
                                    track.processing_type
                                  )} text-white`}
                                >
                                  {getTrackTypeLabel(track.processing_type)}
                                </Badge>
                              </div>
                            )}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <FileAudio className="w-3 h-3" />
                            {formatFileSize(track.file_size)}
                          </div>
                          <div className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {formatDuration(track.duration_seconds)}
                          </div>
                        </div>

                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex-1"
                            onClick={() => handlePlayTrack(track.track_id)}
                          >
                            {playingTrack === track.track_id ? (
                              <Pause className="w-3 h-3" />
                            ) : (
                              <Play className="w-3 h-3" />
                            )}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              handleDownloadTrack(
                                track.track_id,
                                track.filename
                              )
                            }
                          >
                            <Download className="w-3 h-3" />
                          </Button>
                          {onAddToEditor && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                onAddToEditor(track.track_id, track.filename)
                              }
                              title="Add to Editor"
                            >
                              <Plus className="w-3 h-3" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
