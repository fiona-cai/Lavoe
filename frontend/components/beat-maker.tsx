"use client";

import { useState, useRef, useEffect } from "react";
import BeatHeader from "@/components/beat/BeatHeader";
import BeatTimeline from "@/components/beat/BeatTimeline";
import AiSidebar from "@/components/beat/AiSidebar";
import AgenticBlurOverlay from "@/components/beat/AgenticBlurOverlay";
import { TracksSidebar } from "@/components/beat/TracksSidebar";
import { BeatGenerationModal, GeneratedBeat } from "@/components/beat/BeatGenerationModal";
import { MusicBlock, Track } from "@/components/beat/types";
import { authFetch } from "@/lib/authFetch";
import * as audioStorage from "@/lib/audioLocalStorage";
import { BACKEND_URL } from "@/lib/backendUrl";
import { changeSpeedBlob, chopBlob } from "@/lib/clientAudioFx";

const initialTracks: Track[] = [];

const initialBlocks: MusicBlock[] = [];

const TIMELINE_WIDTH = 800;
const TIMELINE_MEASURES = 64; // measures instead of seconds
const PIXELS_PER_MEASURE = TIMELINE_WIDTH / TIMELINE_MEASURES;
const START_MEASURE = 1; // Transport starts at measure 1

export default function BeatMaker() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(START_MEASURE);
  const [bpm, setBpm] = useState(160);
  const [blocks, setBlocks] = useState<MusicBlock[]>(initialBlocks);
  const [tracks, setTracks] = useState<Track[]>(initialTracks);
  const [selectedBlock, setSelectedBlock] = useState<string | null>(null);
  const [aiPrompt, setAiPrompt] = useState("");
  const [insertionPoint, setInsertionPoint] = useState<{
    time: number;
    trackIndex: number;
  } | null>(null);
  const [tracksRefreshTrigger, setTracksRefreshTrigger] = useState(0);
  const [generatedCatalogTracks, setGeneratedCatalogTracks] = useState<any[]>([]);
  const [isGeneratingTrack, setIsGeneratingTrack] = useState(false);
  const [generationStatus, setGenerationStatus] = useState<string>("");
  const [agentBusy, setAgentBusy] = useState(false);
  const [justResumed, setJustResumed] = useState(false);

  // Beat generation modal state
  const [showBeatModal, setShowBeatModal] = useState(false);
  const [beatModalPrompt, setBeatModalPrompt] = useState("");

  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const trackAudioRefs = useRef<Map<string, HTMLAudioElement>>(new Map());

  // Initialize Web Audio API
  useEffect(() => {
    if (typeof window !== "undefined") {
      audioContextRef.current = new (window.AudioContext ||
        (window as any).webkitAudioContext)();
    }
    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  const startPlayback = async () => {
    if (!isPlaying) {
      console.log("🎵 Starting playback...");
      console.log("Tracks:", tracks.length);
      console.log(
        "Tracks with audio:",
        tracks.filter((t) => t.audioFile || t.audioBlob)
      );
      console.log("Audio refs map size:", trackAudioRefs.current.size);
      console.log("Current time:", currentTime);

      // Initialize audio context with user gesture
      if (audioContextRef.current?.state === "suspended") {
        try {
          await audioContextRef.current.resume();
          console.log("✅ Audio context resumed");
        } catch (error) {
          console.error("❌ Failed to resume audio context:", error);
        }
      }

      setIsPlaying(true);

      // Audio will be triggered by blocks during timeline progression
      console.log(
        `🎵 Playback started, will trigger audio based on block positions`
      );

      intervalRef.current = setInterval(() => {
        setCurrentTime((prev) => {
          const newTime = prev + 0.25; // quarter beat increments

          // Check if any blocks should start playing at this time
          blocks.forEach((block) => {
            const track = tracks[block.track];
            if (track && (track.audioFile || track.audioBlob) && !track.muted) {
              // Use block-specific trackId if available (for processed audio), otherwise use track.id
              const audioKey = block.trackId || track.id;
              const audioElement = trackAudioRefs.current.get(audioKey);
              console.log(
                "running for track",
                track,
                audioElement,
                trackAudioRefs.current
              );

              if (audioElement) {
                // Check if blue line just entered this block
                const wasBeforeBlock = prev < block.startTime;
                const isInBlock =
                  newTime >= block.startTime &&
                  newTime < block.startTime + block.duration;

                // Edge: trigger when starting exactly at a block's start measure
                const isAtBlockStartEdge = prev === block.startTime;

                if ((wasBeforeBlock || isAtBlockStartEdge) && isInBlock) {
                  console.log(
                    `🎶 Blue line hit block "${block.name}" at time ${newTime}`
                  );
                  audioElement.currentTime = 0;
                  audioElement.volume = track.volume / 100;
                  audioElement
                    .play()
                    .then(() => {
                      console.log(`✅ Playing ${block.name}`);
                    })
                    .catch((error) => {
                      console.error(`❌ Failed to play ${block.name}:`, error);
                    });
                }

                // Check if blue line just exited this block
                const wasInBlock =
                  prev >= block.startTime &&
                  prev < block.startTime + block.duration;
                const isAfterBlock =
                  newTime >= block.startTime + block.duration;

                if (wasInBlock && isAfterBlock) {
                  console.log(
                    `⏹️ Blue line exited block "${block.name}" at time ${newTime}`
                  );
                  audioElement.pause();
                  audioElement.currentTime = 0;
                }
              }
            }
          });

          return newTime >= TIMELINE_MEASURES ? START_MEASURE : newTime;
        });
      }, (60 / bpm / 4) * 1000); // quarter note timing based on BPM
    }
  };

  const stopPlayback = () => {
    setIsPlaying(false);
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    // Pause all track audio
    trackAudioRefs.current.forEach((audioElement) => {
      audioElement.pause();
    });
  };

  const resetPlayback = () => {
    stopPlayback();
    setCurrentTime(START_MEASURE);

    // Reset all track audio to beginning
    trackAudioRefs.current.forEach((audioElement) => {
      if (audioElement.duration && isFinite(audioElement.duration)) {
        audioElement.currentTime = 0;
      }
    });

    console.log(`🔄 Reset to time ${START_MEASURE}`);
  };

  const fastForward = () => {
    const skipAmount = 8; // Skip forward 8 measures
    const newTime = Math.min(currentTime + skipAmount, TIMELINE_MEASURES);

    // Stop all currently playing audio
    trackAudioRefs.current.forEach((audioElement) => {
      audioElement.pause();
      audioElement.currentTime = 0;
    });

    setCurrentTime(newTime);

    // If playing, set justResumed flag to trigger audio at new position
    if (isPlaying) {
      setJustResumed(true);
    }

    console.log(`⏩ Fast forward to time ${newTime}`);
  };

  const rewind = () => {
    const skipAmount = 8; // Skip backward 8 measures
    const newTime = Math.max(currentTime - skipAmount, START_MEASURE);

    // Stop all currently playing audio
    trackAudioRefs.current.forEach((audioElement) => {
      audioElement.pause();
      audioElement.currentTime = 0;
    });

    setCurrentTime(newTime);

    // If playing, set justResumed flag to trigger audio at new position
    if (isPlaying) {
      setJustResumed(true);
    }

    console.log(`⏪ Rewind to time ${newTime}`);
  };

  const exportTimeline = async () => {
    try {
      console.log("🎵 Starting timeline export...");

      // Create an offline audio context for rendering
      const sampleRate = 44100;
      const timelineDurationInSeconds = ((TIMELINE_MEASURES * 60) / bpm) * 4; // Convert measures to seconds
      const offlineContext = new OfflineAudioContext(
        2,
        sampleRate * timelineDurationInSeconds,
        sampleRate
      );

      const blockPositions: { buffer: AudioBuffer; startTime: number }[] = [];

      // Load all audio files and decode them
      for (const block of blocks) {
        const track = tracks[block.track];
        if (track && (track.audioFile || track.audioBlob) && !track.muted) {
          try {
            const audioData = track.audioFile
              ? await track.audioFile.arrayBuffer()
              : await track.audioBlob!.arrayBuffer();

            const audioBuffer = await offlineContext.decodeAudioData(audioData);

            // Calculate start time in seconds
            const startTimeInSeconds = ((block.startTime * 60) / bpm) * 4;

            blockPositions.push({
              buffer: audioBuffer,
              startTime: startTimeInSeconds,
            });

            console.log(`📁 Loaded "${block.name}" for export`);
          } catch (error) {
            console.error(
              `❌ Failed to load audio for "${block.name}":`,
              error
            );
          }
        }
      }

      // Create audio sources and schedule them
      blockPositions.forEach(({ buffer, startTime }) => {
        const source = offlineContext.createBufferSource();
        source.buffer = buffer;
        source.connect(offlineContext.destination);
        source.start(startTime);
      });

      console.log("🎵 Rendering timeline...");

      // Render the audio
      const renderedBuffer = await offlineContext.startRendering();

      // Convert to WAV and download
      const wavBlob = audioBufferToWav(renderedBuffer);
      const url = URL.createObjectURL(wavBlob);

      const a = document.createElement("a");
      a.href = url;
      a.download = `lavoe-timeline-${Date.now()}.wav`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      console.log("✅ Timeline exported successfully!");
    } catch (error) {
      console.error("❌ Export failed:", error);
      alert("Export failed. Please try again.");
    }
  };

  // Helper function to convert AudioBuffer to WAV
  const audioBufferToWav = (buffer: AudioBuffer): Blob => {
    const length = buffer.length;
    const numberOfChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const arrayBuffer = new ArrayBuffer(44 + length * numberOfChannels * 2);
    const view = new DataView(arrayBuffer);

    // WAV header
    const writeString = (offset: number, string: string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };

    writeString(0, "RIFF");
    view.setUint32(4, 36 + length * numberOfChannels * 2, true);
    writeString(8, "WAVE");
    writeString(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numberOfChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numberOfChannels * 2, true);
    view.setUint16(32, numberOfChannels * 2, true);
    view.setUint16(34, 16, true);
    writeString(36, "data");
    view.setUint32(40, length * numberOfChannels * 2, true);

    // Convert float samples to 16-bit PCM
    let offset = 44;
    for (let i = 0; i < length; i++) {
      for (let channel = 0; channel < numberOfChannels; channel++) {
        const sample = Math.max(
          -1,
          Math.min(1, buffer.getChannelData(channel)[i])
        );
        view.setInt16(offset, sample * 0x7fff, true);
        offset += 2;
      }
    }

    return new Blob([arrayBuffer], { type: "audio/wav" });
  };

  const handleBlockClick = (blockId: string) => {
    setSelectedBlock(selectedBlock === blockId ? null : blockId);
  };

  const generateAIComponent = async (
    mode: "beat" | "agent" = "beat",
    provider: "beatoven" | "mubert" = "beatoven"
  ) => {
    if (!aiPrompt.trim()) return;

    if (mode === "beat") {
      if (!aiPrompt.trim()) return;
      // Handle Beatmaker mode - generate actual tracks
      if (provider === "mubert") {
        await generateMubertTrack(aiPrompt);
      } else {
        await generateBeatovenTrack(aiPrompt);
      }
    } else {
      // Agent mode handled via AiSidebar status; nothing to do here
    }
  };

  // Handler for beat prompt submission from timeline
  const handleBeatPromptSubmit = (
    prompt: string,
    selectionBounds: { x: number; y: number; width: number; height: number }
  ) => {
    console.log("🎵 Beat prompt submitted:", prompt);
    console.log("📐 Selection bounds:", selectionBounds);

    // Open modal and start generation
    setBeatModalPrompt(prompt);
    setShowBeatModal(true);
  };

  // Generate beat for modal (returns GeneratedBeat)
  const generateBeatForModal = async (prompt: string): Promise<GeneratedBeat> => {
    console.log("🎹 Starting beat generation for modal...");
    console.log("📝 Prompt:", prompt);

    // Start track generation
    console.log("🌐 Calling Beatoven API: POST /start_track_generation");
    const response = await authFetch(
      `${BACKEND_URL}/start_track_generation`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt: { text: prompt },
          format: "mp3",
          looping: false,
        }),
      }
    );

    if (!response.ok) {
      const text = await response.text();
      console.error("❌ Beatoven API failed:", response.status, text);
      throw new Error("Failed to start track generation");
    }

    const result = await response.json();
    const taskId = result.task_id;
    console.log("✅ Beatoven task started, task ID:", taskId);

    // Poll for completion
    console.log("⏳ Starting polling for task completion...");
    const generatedTracks = await pollForBeatCompletion(taskId);

    console.log("🎉 Beat generation complete! Tracks received:", generatedTracks);

    return generatedTracks;
  };

  // Poll for beat completion (for modal)
  const pollForBeatCompletion = async (taskId: string): Promise<GeneratedBeat> => {
    const maxAttempts = 60;
    let attempts = 0;

    while (attempts < maxAttempts) {
      attempts++;
      console.log(`🔄 Polling attempt ${attempts}/${maxAttempts}...`);

      const response = await authFetch(
        `${BACKEND_URL}/get_generated_track?task_id=${taskId}`
      );

      if (!response.ok) {
        console.error("❌ Poll request failed:", response.status);
        throw new Error("Failed to check track status");
      }

      const result = await response.json();
      console.log("📊 Poll result:", result.status);

      if (result.status === "composed") {
        console.log("✨ Track composed! Downloading audio files...");

        // Download all audio files
        const mainBlob = await downloadTrack(result.track_id);
        const bassBlob = await downloadTrack(result.stems.bass);
        const chordsBlob = await downloadTrack(result.stems.chords);
        const melodyBlob = await downloadTrack(result.stems.melody);
        const percussionBlob = await downloadTrack(result.stems.percussion);

        // Store in localStorage
        console.log("💾 Storing audio files in localStorage...");
        await audioStorage.storeAudio(result.track_id, mainBlob, { type: "main" });
        await audioStorage.storeAudio(result.stems.bass, bassBlob, { type: "bass" });
        await audioStorage.storeAudio(result.stems.chords, chordsBlob, { type: "chords" });
        await audioStorage.storeAudio(result.stems.melody, melodyBlob, { type: "melody" });
        await audioStorage.storeAudio(result.stems.percussion, percussionBlob, { type: "percussion" });

        console.log("✅ All audio files stored successfully!");

        return {
          main: {
            id: result.track_id,
            blob: mainBlob,
            url: URL.createObjectURL(mainBlob),
          },
          stems: {
            bass: {
              id: result.stems.bass,
              blob: bassBlob,
              url: URL.createObjectURL(bassBlob),
            },
            chords: {
              id: result.stems.chords,
              blob: chordsBlob,
              url: URL.createObjectURL(chordsBlob),
            },
            melody: {
              id: result.stems.melody,
              blob: melodyBlob,
              url: URL.createObjectURL(melodyBlob),
            },
            percussion: {
              id: result.stems.percussion,
              blob: percussionBlob,
              url: URL.createObjectURL(percussionBlob),
            },
          },
        };
      }

      if (result.status === "failed" || result.status === "error") {
        console.error("❌ Track generation failed:", result);
        throw new Error("Track generation failed");
      }

      // Still processing, wait and try again
      console.log("⏱️  Still processing, waiting 10 seconds...");
      await new Promise((resolve) => setTimeout(resolve, 10000));
    }

    console.error("⏰ Polling timeout after 10 minutes");
    throw new Error("Track generation timed out");
  };

  // Download track from backend
  const downloadTrack = async (trackId: string): Promise<Blob> => {
    console.log(`📥 Downloading track: ${trackId}`);
    const response = await authFetch(
      `${BACKEND_URL}/tracks/${encodeURIComponent(trackId)}/download`
    );

    if (!response.ok) {
      console.error(`❌ Failed to download track ${trackId}`);
      throw new Error(`Failed to download track ${trackId}`);
    }

    const data = await response.json();
    const audioResponse = await fetch(data.url);
    const blob = await audioResponse.blob();

    console.log(`✅ Downloaded track ${trackId}, size: ${blob.size} bytes`);
    return blob;
  };

  const generateBeatovenTrack = async (prompt: string) => {
    try {
      setIsGeneratingTrack(true);
      setGenerationStatus("Starting track generation...");

      // Start track generation
      console.log("Beatoven: POST /start_track_generation (prompt)", {
        prompt,
      });
      const response = await authFetch(
        `${BACKEND_URL}/start_track_generation`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            prompt: { text: prompt },
            format: "mp3",
            looping: false,
          }),
        }
      );

      if (!response.ok) {
        const text = await response.text();
        console.error(
          "Beatoven: start generation failed",
          response.status,
          text
        );
        let detail = "Failed to start track generation";
        try {
          const parsed = JSON.parse(text);
          detail = parsed.error || parsed.detail || detail;
        } catch {
          if (text) detail = text;
        }
        throw new Error(detail);
      }

      const result = await response.json();
      const taskId = result.task_id;
      console.log("Beatoven: task started", { taskId, result });

      setAiPrompt("");
      setGenerationStatus("Track generation in progress...");

      // Start polling for completion
      pollForTrackCompletion(taskId, prompt);
    } catch (error) {
      console.error("Error generating track:", error);
      setIsGeneratingTrack(false);
      setGenerationStatus(
        error instanceof Error
          ? error.message
          : "Failed to start track generation. Please try again."
      );
      setTimeout(() => {
        setGenerationStatus("");
      }, 5000);
    }
  };

  const pollForTrackCompletion = async (
    taskId: string,
    originalPrompt: string
  ) => {
    const maxAttempts = 60; // 10 minutes max (60 * 10 seconds)
    let attempts = 0;

    const poll = async () => {
      try {
        attempts++;

        console.log("Beatoven: GET /get_generated_track", {
          taskId,
          attempt: attempts,
        });
        const response = await authFetch(
          `${BACKEND_URL}/get_generated_track?task_id=${taskId}`
        );

        if (!response.ok) {
          const text = await response.text();
          console.error("Beatoven: poll failed", response.status, text);
          throw new Error("Failed to check track status");
        }

        const result = await response.json();
        console.log("Beatoven: poll result", result);

        if (result.status === "composed") {
          // Track generation completed - the tracks are now stored in our system
          console.log("Track generation completed:", result);
          if (Array.isArray(result.catalog)) {
            setGeneratedCatalogTracks(result.catalog);
          }
          setGenerationStatus(
            "Track generation completed! Check the Tracks tab."
          );
          setIsGeneratingTrack(false);
          // Trigger tracks refresh
          setTracksRefreshTrigger((prev) => prev + 1);

          // Clear status after a few seconds
          setTimeout(() => {
            setGenerationStatus("");
          }, 5000);

          return;
        } else if (
          result.status === "running" ||
          result.status === "composing"
        ) {
          // Still processing
          setGenerationStatus(
            `Track generation in progress... (${attempts}/${maxAttempts})`
          );
          if (attempts < maxAttempts) {
            setTimeout(poll, 10000); // Poll every 10 seconds
          } else {
            console.error("Track generation timed out");
            setGenerationStatus(
              "Track generation timed out. Please try again."
            );
            setIsGeneratingTrack(false);
            setTimeout(() => {
              setGenerationStatus("");
            }, 5000);
          }
        } else {
          // Unknown status or error
          console.error("Unexpected track generation status:", result.status);
          setGenerationStatus(`Unexpected status: ${result.status}`);
          setIsGeneratingTrack(false);
          setTimeout(() => {
            setGenerationStatus("");
          }, 5000);
        }
      } catch (error) {
        console.error("Error polling track status:", error);
        setGenerationStatus("Error checking track status. Retrying...");
        if (attempts < maxAttempts) {
          setTimeout(poll, 10000); // Retry after 10 seconds
        } else {
          setIsGeneratingTrack(false);
          setGenerationStatus(
            "Failed to check track status. Please try again."
          );
          setTimeout(() => {
            setGenerationStatus("");
          }, 5000);
        }
      }
    };

    // Start polling
    poll();
  };

  const generateMubertTrack = async (prompt: string) => {
    try {
      setIsGeneratingTrack(true);
      setGenerationStatus("Starting Mubert track generation...");

      // Start track generation
      console.log("Mubert: POST /start_mubert_generation", { prompt });
      const response = await authFetch(
        `${BACKEND_URL}/start_mubert_generation`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            prompt: prompt,
            duration: 60,
            bitrate: 128,
            mode: "track",
            intensity: "medium",
            format: "mp3",
          }),
        }
      );

      if (!response.ok) {
        const text = await response.text();
        console.error("Mubert: start failed", response.status, text);
        throw new Error("Failed to start Mubert track generation");
      }

      const result = await response.json();
      const trackId = result.track_id;
      console.log("Mubert: started", { trackId, result });

      setAiPrompt("");
      setGenerationStatus("Track generation in progress...");

      // Start polling for completion
      pollForMubertTrackCompletion(trackId, prompt);
    } catch (error) {
      console.error("Error generating Mubert track:", error);
      setIsGeneratingTrack(false);
      setGenerationStatus(
        "Failed to start track generation. Please try again."
      );
      setTimeout(() => {
        setGenerationStatus("");
      }, 5000);
    }
  };

  const pollForMubertTrackCompletion = async (
    trackId: string,
    originalPrompt: string
  ) => {
    const maxAttempts = 30; // 5 minutes max (30 * 10 seconds)
    let attempts = 0;

    const poll = async () => {
      try {
        attempts++;

        console.log("Mubert: GET /get_mubert_track", {
          trackId,
          attempt: attempts,
        });
        const response = await authFetch(
          `${BACKEND_URL}/get_mubert_track?track_id=${trackId}`
        );

        if (!response.ok) {
          const text = await response.text();
          console.error("Mubert: poll failed", response.status, text);
          throw new Error("Failed to check Mubert track status");
        }

        const result = await response.json();
        console.log("Mubert: poll result", result);

        if (result.status === "completed") {
          // Track generation completed - the track is now stored in our system
          console.log("Mubert track generation completed:", result);
          setGenerationStatus(
            "Track generation completed! Check the Tracks tab."
          );
          setIsGeneratingTrack(false);
          // Trigger tracks refresh
          setTracksRefreshTrigger((prev) => prev + 1);

          // Clear status after a few seconds
          setTimeout(() => {
            setGenerationStatus("");
          }, 5000);

          return;
        } else if (result.status === "processing") {
          // Still processing
          setGenerationStatus(
            `Mubert track generation in progress... (${attempts}/${maxAttempts})`
          );
          if (attempts < maxAttempts) {
            setTimeout(poll, 10000); // Poll every 10 seconds
          } else {
            console.error("Mubert track generation timed out");
            setGenerationStatus(
              "Track generation timed out. Please try again."
            );
            setIsGeneratingTrack(false);
            setTimeout(() => {
              setGenerationStatus("");
            }, 5000);
          }
        } else {
          // Unknown status or error
          console.error(
            "Unexpected Mubert track generation status:",
            result.status
          );
          setGenerationStatus(`Unexpected status: ${result.status}`);
          setIsGeneratingTrack(false);
          setTimeout(() => {
            setGenerationStatus("");
          }, 5000);
        }
      } catch (error) {
        console.error("Error polling Mubert track status:", error);
        setGenerationStatus("Error checking track status. Retrying...");
        if (attempts < maxAttempts) {
          setTimeout(poll, 10000); // Retry after 10 seconds
        } else {
          setIsGeneratingTrack(false);
          setGenerationStatus(
            "Failed to check track status. Please try again."
          );
          setTimeout(() => {
            setGenerationStatus("");
          }, 5000);
        }
      }
    };

    // Start polling
    poll();
  };

  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  const handleVolumeChange = (trackId: string, volume: number) => {
    setTracks(
      tracks.map((track) =>
        track.id === trackId ? { ...track, volume } : track
      )
    );
  };

  const handleMuteToggle = (trackId: string) => {
    setTracks(
      tracks.map((track) =>
        track.id === trackId ? { ...track, muted: !track.muted } : track
      )
    );
  };

  const addTrack = () => {
    const trackColors = [
      "bg-blue-600",
      "bg-cyan-500",
      "bg-violet-600",
      "bg-pink-500",
      "bg-emerald-500",
      "bg-orange-500",
      "bg-red-500",
      "bg-yellow-500",
      "bg-indigo-500",
      "bg-purple-500",
    ];

    const trackNames = [
      "Melody",
      "Bass",
      "Drums",
      "Percussion",
      "Lead",
      "Pad",
      "Arp",
      "FX",
      "Vocals",
      "Strings",
    ];

    const newTrack: Track = {
      id: `track-${Date.now()}`,
      name: trackNames[tracks.length % trackNames.length],
      color: trackColors[tracks.length % trackColors.length],
      muted: false,
      volume: 75,
    };

    setTracks((prev) => [...prev, newTrack]);
  };

  const handleFileUpload = async (file: File) => {
    try {
      // First, upload the file to the backend storage system
      const formData = new FormData();
      formData.append("file", file);

      const response = await authFetch(`${BACKEND_URL}/upload-audio`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Upload failed: ${response.statusText}`);
      }

      const result = await response.json();
      console.log("File uploaded to storage:", result);

      // Trigger tracks list refresh to show the uploaded file
      setTracksRefreshTrigger((prev) => prev + 1);

      // Also create local track and block for the timeline editor
      const trackColors = [
        "bg-blue-600",
        "bg-cyan-500",
        "bg-violet-600",
        "bg-pink-500",
        "bg-emerald-500",
        "bg-orange-500",
        "bg-red-500",
        "bg-yellow-500",
        "bg-indigo-500",
        "bg-purple-500",
      ];

      // Extract filename without extension for track name
      const fileName = file.name.split(".")[0];
      const trackId = `track-${Date.now()}`;

      const newTrack: Track = {
        id: trackId,
        name: fileName,
        color: trackColors[tracks.length % trackColors.length],
        muted: false,
        volume: 75,
        audioFile: file, // Store the file reference for local playback
      };

      setTracks((prev) => [...prev, newTrack]);

      // Create audio element for timeline playback
      const audioElement = new Audio(URL.createObjectURL(file));
      audioElement.loop = false;
      audioElement.preload = "metadata";
      trackAudioRefs.current.set(trackId, audioElement);

      // Create a music block at the start of the timeline (measure 1)
      // Duration will be set once audio metadata loads
      const newBlock: MusicBlock = {
        id: `block-${Date.now()}`,
        name: fileName,
        type: "melody",
        color: trackColors[tracks.length % trackColors.length],
        startTime: START_MEASURE, // Always start at beginning
        duration: 8, // Temporary duration, will be updated
        track: tracks.length, // Use the new track index
        trackId: trackId, // Include track ID for AI agent
        audioFile: file, // Include audio file for waveform display
      };

      setBlocks((prev) => [...prev, newBlock]);

      // Update block duration once audio metadata loads
      audioElement.addEventListener("loadedmetadata", () => {
        const audioDurationInMeasures =
          (audioElement.duration / 60) * (160 / 4); // Convert to measures based on BPM
        setBlocks((prevBlocks) =>
          prevBlocks.map((block) =>
            block.id === newBlock.id
              ? { ...block, duration: Math.max(1, audioDurationInMeasures) }
              : block
          )
        );
      });
    } catch (error) {
      console.error("Error uploading file:", error);
      // Could add toast notification here for better UX
    }
  };

  const handleRecordingComplete = async (audioBlob: Blob) => {
    try {
      // First, upload the recording to the backend storage system
      const trackName = `Recording ${tracks.length + 1}`;
      const formData = new FormData();
      formData.append("file", audioBlob, `${trackName}.wav`);

      const response = await authFetch(`${BACKEND_URL}/upload-audio`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Upload failed: ${response.statusText}`);
      }

      const result = await response.json();
      console.log("Recording uploaded to storage:", result);

      // Trigger tracks list refresh to show the uploaded recording
      setTracksRefreshTrigger((prev) => prev + 1);

      // Also create local track and block for the timeline editor
      const trackColors = [
        "bg-blue-600",
        "bg-cyan-500",
        "bg-violet-600",
        "bg-pink-500",
        "bg-emerald-500",
        "bg-orange-500",
        "bg-red-500",
        "bg-yellow-500",
        "bg-indigo-500",
        "bg-purple-500",
      ];

      const trackColor = trackColors[tracks.length % trackColors.length];
      const trackId = `track-${Date.now()}`;

      const newTrack: Track = {
        id: trackId,
        name: trackName,
        color: trackColor,
        muted: false,
        volume: 75,
        audioBlob: audioBlob, // Store the blob reference for local playback
      };

      setTracks((prev) => [...prev, newTrack]);

      // Create audio element for timeline playback
      const audioElement = new Audio(URL.createObjectURL(audioBlob));
      audioElement.loop = false;
      audioElement.preload = "metadata";

      // Add comprehensive event listeners for debugging
      audioElement.addEventListener("loadedmetadata", () => {
        console.log(`📊 Audio metadata loaded for ${trackName}:`, {
          duration: audioElement.duration,
          readyState: audioElement.readyState,
        });
      });

      audioElement.addEventListener("canplay", () => {
        console.log(`▶️ Audio can play: ${trackName}`);
      });

      audioElement.addEventListener("error", (e) => {
        console.error(`❌ Audio error for ${trackName}:`, e);
      });

      trackAudioRefs.current.set(trackId, audioElement);
      console.log(`🎤 Created audio element for ${trackName}:`, {
        trackId,
        src: audioElement.src.substring(0, 50) + "...",
        preload: audioElement.preload,
      });

      // Create a music block at the start of the timeline (measure 1)
      // Duration will be set once audio metadata loads
      const newBlock: MusicBlock = {
        id: `block-${Date.now()}`,
        name: trackName,
        type: "melody",
        color: trackColor,
        startTime: START_MEASURE, // Always start at beginning
        duration: 8, // Temporary duration, will be updated
        track: tracks.length, // Use the new track index
        trackId: trackId, // Include track ID for AI agent
        audioBlob: audioBlob, // Include audio blob for waveform display
      };

      setBlocks((prev) => [...prev, newBlock]);

      // Update block duration once audio metadata loads
      audioElement.addEventListener("loadedmetadata", () => {
        const audioDurationInMeasures = (audioElement.duration / 60) * bpm; // Convert to measures based on BPM
        setBlocks((prevBlocks) =>
          prevBlocks.map((block) =>
            block.id === newBlock.id
              ? { ...block, duration: Math.max(1, audioDurationInMeasures) }
              : block
          )
        );
      });
    } catch (error) {
      console.error("Error uploading recording:", error);
      // Could add toast notification here for better UX
    }
  };

  const handleAddTrackToEditor = async (trackId: string, filename: string) => {
    try {
      // Download the track from the backend
      const response = await authFetch(
        `${BACKEND_URL}/tracks/${encodeURIComponent(trackId)}/download`
      );
      if (!response.ok) {
        throw new Error("Failed to download track");
      }

      const { url: signedUrl } = await response.json();
      const blobResp = await fetch(signedUrl);
      const audioBlob = await blobResp.blob();
      const audioFile = new File([audioBlob], filename, {
        type: audioBlob.type,
      });

      // Create a track from the downloaded file
      const trackColors = [
        "bg-blue-600",
        "bg-cyan-500",
        "bg-violet-600",
        "bg-pink-500",
        "bg-emerald-500",
        "bg-orange-500",
        "bg-red-500",
        "bg-yellow-500",
        "bg-indigo-500",
        "bg-purple-500",
      ];

      // Extract filename without extension for track name
      const fileName = filename.split(".")[0];
      const localTrackId = `track-${Date.now()}`;

      const newTrack: Track = {
        id: localTrackId,
        name: fileName,
        color: trackColors[tracks.length % trackColors.length],
        muted: false,
        volume: 75,
        audioFile: audioFile, // Store the file reference for local playback
      };

      console.log("created new track on editor", newTrack);

      setTracks((prev) => [...prev, newTrack]);

      // Create audio element for timeline playback
      const audioElement = new Audio(URL.createObjectURL(audioFile));
      audioElement.loop = false;
      audioElement.preload = "metadata";
      // Store with both localTrackId (for track reference) and trackId (for block reference)
      trackAudioRefs.current.set(localTrackId, audioElement);
      trackAudioRefs.current.set(trackId, audioElement);

      // Create a music block at the start of the timeline (measure 1)
      // Duration will be set once audio metadata loads
      const newBlock: MusicBlock = {
        id: `block-${Date.now()}`,
        name: fileName,
        type: "melody",
        color: trackColors[tracks.length % trackColors.length],
        startTime: START_MEASURE, // Always start at beginning
        duration: 8, // Temporary duration, will be updated
        track: tracks.length, // Use the new track index
        trackId: trackId, // Include backend track ID for AI agent
        audioFile: audioFile, // Include audio file for waveform display
      };

      setBlocks((prev) => [...prev, newBlock]);

      console.log("new block", newBlock);

      // Update block duration once audio metadata loads
      audioElement.addEventListener("loadedmetadata", () => {
        const audioDurationInMeasures = (audioElement.duration / 60) * bpm; // Convert to measures based on BPM
        setBlocks((prevBlocks) =>
          prevBlocks.map((block) =>
            block.id === newBlock.id
              ? { ...block, duration: Math.max(1, audioDurationInMeasures) }
              : block
          )
        );
      });

      console.log(`Added track "${filename}" to editor`);
    } catch (error) {
      console.error("Error adding track to editor:", error);
      // Could add toast notification here for better UX
    }
  };

  // Timeline click no longer needed for insertion points
  const handleTimelineClick = (time: number, trackIndex: number) => {
    // Could be used for other timeline interactions in the future
  };

  const handleTimeChange = (time: number) => {
    setCurrentTime(time);
  };

  const handleBlockMove = (
    blockId: string,
    newTime: number,
    newTrackIndex: number
  ) => {
    setBlocks((prevBlocks) =>
      prevBlocks.map((block) =>
        block.id === blockId ? { ...block, startTime: newTime } : block
      )
    );
  };

  const getSourceAudio = (block: MusicBlock): Blob | File | null => {
    if (block.audioFile) return block.audioFile;
    if (block.audioBlob) return block.audioBlob;
    const track =
      (typeof block.track === "number" ? tracks[block.track] : undefined) ||
      tracks.find((item) => item.id === block.trackId);
    return track?.audioFile || track?.audioBlob || null;
  };

  const handleSpeedAdjust = async (blockId: string, speedFactor: number) => {
    const targetBlock = blocks.find((block) => block.id === blockId);
    if (!targetBlock) {
      throw new Error(`Block ${blockId} not found`);
    }
    const source = getSourceAudio(targetBlock);
    if (!source) {
      throw new Error(`No audio found for ${targetBlock.name}`);
    }

    const audioBlob = await changeSpeedBlob(source, speedFactor);
    const audioFile = new File(
      [audioBlob],
      `${targetBlock.name}-${speedFactor}x.wav`,
      { type: "audio/wav" }
    );
    const processedId = `speed_${Date.now()}`;
    const audioElement = new Audio(URL.createObjectURL(audioBlob));
    audioElement.preload = "auto";
    trackAudioRefs.current.set(processedId, audioElement);
    if (tracks[targetBlock.track]) {
      trackAudioRefs.current.set(tracks[targetBlock.track].id, audioElement);
    }

    await new Promise<void>((resolve) => {
      audioElement.addEventListener(
        "loadedmetadata",
        () => {
          const newDurationInMeasures = (audioElement.duration / 60) * bpm;
          setBlocks((prevBlocks) =>
            prevBlocks.map((block) =>
              block.id === blockId
                ? {
                    ...block,
                    trackId: processedId,
                    audioFile,
                    audioBlob,
                    duration: Math.max(1, newDurationInMeasures),
                    name: `${block.name} (${speedFactor}x)`,
                  }
                : block
            )
          );
          resolve();
        },
        { once: true }
      );
    });
  };

  const handleClientChop = async (
    trackId: string,
    options: {
      defaultLength?: number;
      minDuration?: number;
      nClusters?: number;
      maxChops?: number;
    } = {}
  ) => {
    const targetBlock =
      blocks.find((block) => block.trackId === trackId || block.id === trackId) ||
      blocks[0];
    if (!targetBlock) {
      throw new Error("No clip on the timeline to chop");
    }
    const source = getSourceAudio(targetBlock);
    if (!source) {
      throw new Error(`No audio found for ${targetBlock.name}`);
    }
    const chops = await chopBlob(
      source,
      `${targetBlock.name}.wav`,
      options.maxChops ?? 6,
      options.minDuration ?? 0.2
    );
    await addChopsToEditor(chops, targetBlock.name);
    return {
      chop_summaries: chops,
      metadata: { source_track_id: trackId },
    };
  };

  const addChopsToEditor = async (chops: any[], originalTrackName: string) => {
    const trackColors = [
      "bg-blue-600",
      "bg-cyan-500",
      "bg-violet-600",
      "bg-pink-500",
      "bg-emerald-500",
      "bg-orange-500",
      "bg-red-500",
      "bg-yellow-500",
      "bg-indigo-500",
      "bg-purple-500",
    ];
    const newTracks: Track[] = [];
    const newBlocks: MusicBlock[] = [];
    let currentTime = START_MEASURE;

    for (let index = 0; index < chops.length; index++) {
      const chop = chops[index];
      const chopTrackId = `chop-track-${Date.now()}-${index}`;
      const blockId = `chop-block-${Date.now()}-${index}`;
      let audioBlob: Blob | null = chop.blob || null;
      if (!audioBlob && chop.track_id) {
        const response = await authFetch(
          `${BACKEND_URL}/tracks/${chop.track_id}/download`
        );
        if (response.ok) {
          const { url: signedUrl } = await response.json();
          audioBlob = await (await fetch(signedUrl)).blob();
        }
      }
      if (!audioBlob) continue;

      const audioFile = new File(
        [audioBlob],
        chop.filename || `chop-${index + 1}.wav`,
        { type: audioBlob.type || "audio/wav" }
      );
      const newTrack: Track = {
        id: chopTrackId,
        name: `${originalTrackName} ${index + 1}`,
        color: trackColors[index % trackColors.length],
        muted: false,
        volume: 75,
        audioFile,
      };
      const audioElement = new Audio(URL.createObjectURL(audioBlob));
      audioElement.loop = false;
      audioElement.preload = "metadata";
      trackAudioRefs.current.set(chopTrackId, audioElement);
      trackAudioRefs.current.set(chop.track_id || chopTrackId, audioElement);
      const durationInMeasures = Math.max(
        1,
        (chop.duration_seconds / 60) * bpm
      );
      newTracks.push(newTrack);
      newBlocks.push({
        id: blockId,
        name: `Chop ${index + 1}`,
        type: "melody",
        color: trackColors[index % trackColors.length],
        startTime: currentTime,
        duration: durationInMeasures,
        track: tracks.length + newTracks.length - 1,
        trackId: chop.track_id || chopTrackId,
        audioBlob,
        audioFile,
      });
      currentTime += durationInMeasures;
    }

    setTracks((prevTracks) => [...prevTracks, ...newTracks]);
    setBlocks((prevBlocks) => [...prevBlocks, ...newBlocks]);
  };

  const handleLoop = (blockId: string, times: number) => {
    console.log(`🔄 Looping block ${blockId} ${times} times`);

    // Use the functional form of setBlocks to access current state
    setBlocks((prevBlocks) => {
      const originalBlock = prevBlocks.find((block) => block.id === blockId);
      if (!originalBlock) {
        console.error(
          `Block ${blockId} not found in current blocks:`,
          prevBlocks.map((b) => b.id)
        );
        return prevBlocks; // Return unchanged state
      }

      const newBlocks: MusicBlock[] = [];

      // Create the specified number of copies
      for (let i = 1; i <= times; i++) {
        const newBlock: MusicBlock = {
          ...originalBlock,
          id: `${originalBlock.id}-loop-${i}-${Date.now()}`,
          name: `${originalBlock.name} (Loop ${i})`,
          startTime: originalBlock.startTime + originalBlock.duration * i,
        };
        newBlocks.push(newBlock);
      }

      console.log(`✅ Created ${times} loops of block ${blockId}`);

      // Return the updated state with new blocks added
      return [...prevBlocks, ...newBlocks];
    });
  };

  const handleDeleteTrack = (trackId: string) => {
    // Find the track index
    const trackIndex = tracks.findIndex((t) => t.id === trackId);
    if (trackIndex === -1) return;

    // Stop and clean up any audio elements associated with this track
    const audioElement = trackAudioRefs.current.get(trackId);
    if (audioElement) {
      audioElement.pause();
      if (audioElement.src && audioElement.src.startsWith("blob:")) {
        URL.revokeObjectURL(audioElement.src);
      }
      trackAudioRefs.current.delete(trackId);
    }

    // Remove all blocks that are on this track
    setBlocks((prev) => prev.filter((b) => b.track !== trackIndex));

    // Remove the track from the tracks list
    setTracks((prev) => prev.filter((t) => t.id !== trackId));

    console.log(`🗑️ Deleted track ${trackId} and all associated blocks`);
  };

  const handleDeleteSelectedBlock = () => {
    if (!selectedBlock) return;

    // Find the block to delete
    const blockToDelete = blocks.find((b) => b.id === selectedBlock);
    if (!blockToDelete) return;

    // Find the track for this block
    const trackForBlock = tracks[blockToDelete.track];

    // If audio is currently playing for this block, stop it
    const isInBlockWindow =
      currentTime >= blockToDelete.startTime &&
      currentTime < blockToDelete.startTime + blockToDelete.duration;

    if (isInBlockWindow) {
      const audioKey = blockToDelete.trackId || trackForBlock?.id;
      if (audioKey) {
        const audioElement = trackAudioRefs.current.get(audioKey);
        if (audioElement) {
          audioElement.pause();
          try {
            audioElement.currentTime = 0;
          } catch {}
        }
      }
    }

    // Remove the block from UI state
    setBlocks((prev) => prev.filter((b) => b.id !== selectedBlock));
    setSelectedBlock(null);

    // Also delete the track that this block was on
    if (trackForBlock) {
      // Clean up audio element
      const audioElement = trackAudioRefs.current.get(trackForBlock.id);
      if (audioElement) {
        audioElement.pause();
        if (audioElement.src && audioElement.src.startsWith("blob:")) {
          URL.revokeObjectURL(audioElement.src);
        }
        trackAudioRefs.current.delete(trackForBlock.id);
      }

      // Remove the track
      setTracks((prev) => prev.filter((t) => t.id !== trackForBlock.id));

      console.log(
        `🗑️ Deleted block ${selectedBlock} and associated track ${trackForBlock.id}`
      );
    }
  };

  // Global key handler for Delete/Backspace to remove selected block
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Delete" && e.key !== "Backspace") return;

      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (
          tag === "INPUT" ||
          tag === "TEXTAREA" ||
          (target as HTMLElement).isContentEditable
        ) {
          return; // Don't interfere with typing
        }
      }

      if (selectedBlock) {
        e.preventDefault();
        handleDeleteSelectedBlock();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedBlock, blocks, tracks, currentTime]);

  return (
    <div className="flex h-screen bg-background text-foreground">
      <div className="border-r border-border">
        <TracksSidebar
          tracks={tracks}
          onVolumeChange={handleVolumeChange}
          onMuteToggle={handleMuteToggle}
          onAddTrack={addTrack}
          onFileUpload={handleFileUpload}
          onRecordingComplete={handleRecordingComplete}
          onDeleteTrack={handleDeleteTrack}
        />
      </div>
      <div className="flex-1 flex flex-col relative">
        {/* Overlay should cover header + timeline area only */}
        <AgenticBlurOverlay active={agentBusy} />
        <BeatHeader
          bpm={bpm}
          isPlaying={isPlaying}
          onStart={startPlayback}
          onStop={stopPlayback}
          onReset={resetPlayback}
        />
        <BeatTimeline
          currentTime={currentTime}
          blocks={blocks}
          tracks={tracks}
          selectedBlock={selectedBlock}
          onBlockClick={handleBlockClick}
          onTimelineClick={handleTimelineClick}
          onTimeChange={handleTimeChange}
          onBlockMove={handleBlockMove}
          insertionPoint={insertionPoint}
          totalMeasures={TIMELINE_MEASURES}
          onBeatPromptSubmit={handleBeatPromptSubmit}
        />
      </div>
      <AiSidebar
        aiPrompt={aiPrompt}
        setAiPrompt={setAiPrompt}
        onSubmit={generateAIComponent}
        tracksRefreshTrigger={tracksRefreshTrigger}
        isGeneratingTrack={isGeneratingTrack}
        generationStatus={generationStatus}
        onAddTrackToEditor={handleAddTrackToEditor}
        generatedCatalogTracks={generatedCatalogTracks}
        blocks={blocks}
        onBlockMove={(blockId: string, newTime: number) => {
          setBlocks((prevBlocks) =>
            prevBlocks.map((block) =>
              block.id === blockId ? { ...block, startTime: newTime } : block
            )
          );
        }}
        onSpeedAdjust={handleSpeedAdjust}
        onLoop={handleLoop}
        onChopAudio={handleClientChop}
        onAgentBusyChange={(busy: boolean) => setAgentBusy(busy)}
        onAddChopsToEditor={addChopsToEditor}
      />

      {/* Beat Generation Modal */}
      <BeatGenerationModal
        isOpen={showBeatModal}
        onClose={() => setShowBeatModal(false)}
        prompt={beatModalPrompt}
        onGenerate={generateBeatForModal}
      />

      {/* Agentic Blur Overlay */}
      <AgenticBlurOverlay isLoading={agentBusy} />
    </div>
  );
}
