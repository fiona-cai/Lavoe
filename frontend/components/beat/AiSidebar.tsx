"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ArrowUp,
  ChevronUp,
  WandSparkles,
  MessageCircle,
  Music,
  Loader2,
} from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { authFetch } from "@/lib/authFetch";
import { BACKEND_URL } from "@/lib/backendUrl";
import type { CatalogTrack } from "@/lib/beatovenTracks";
import { PREMADE_TRACKS } from "@/lib/premadeTracks";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Catalog from "./Catalog";
import { MusicLoadingState } from "./MusicLoadingState";
import { useChat } from "@ai-sdk/react";
import { openai } from "@ai-sdk/openai";
import { MusicBlock } from "./types";
import { DefaultChatTransport } from "ai";

// Enhanced AI Response UI components (UI-only; does not alter streaming logic)
interface ToolOperation {
  id: string;
  type: "moveBlock" | "chopAudio" | "adjustSpeed" | "loop" | "text";
  state:
    | "input-streaming"
    | "input-available"
    | "output-available"
    | "output-error"
    | "complete";
  input?: any;
  output?: string;
  errorText?: string;
  text?: string;
}

interface EnhancedAIResponseProps {
  operations: ToolOperation[];
  isStreaming?: boolean;
  className?: string;
}

const colors = [
  "rgba(255,165,0,0.08)", // Orange
  "rgba(255,69,0,0.08)", // Red-Orange
  "rgba(255,20,147,0.08)", // Deep Pink
  "rgba(138,43,226,0.08)", // Blue Violet
  "rgba(0,191,255,0.08)", // Deep Sky Blue
  "rgba(0,255,127,0.08)", // Spring Green
  "rgba(255,255,0,0.08)", // Yellow
  "rgba(255,140,0,0.08)", // Dark Orange
];

// Simple streaming text reveal component (UI-only)
function StreamingText({
  text,
  className = "",
  active = false,
}: {
  text: string;
  className?: string;
  active?: boolean;
}) {
  const [visibleLength, setVisibleLength] = useState(0);

  useEffect(() => {
    if (!active) {
      // Immediately show full text when not actively streaming
      setVisibleLength(text.length);
      return;
    }

    // Reset when switching to active or text changes
    setVisibleLength((len) => (len === 0 ? 0 : len));

    const step = () =>
      setVisibleLength((len) => Math.min(text.length, len + 1));
    const id = window.setInterval(step, 12);
    return () => window.clearInterval(id);
  }, [text, active]);

  // If text grows because of real-time streaming, reveal progressively
  const content = active ? text.slice(0, visibleLength) : text;
  return <div className={className}>{content}</div>;
}

const OperationCard = ({
  operation,
  colorIndex,
  isLast,
}: {
  operation: ToolOperation;
  colorIndex: number;
  isLast: boolean;
}) => {
  const isProcessing =
    operation.state === "input-streaming" ||
    operation.state === "input-available";
  const isComplete =
    operation.state === "output-available" || operation.state === "complete";
  const hasError = operation.state === "output-error";

  const getOperationDescription = (operation: ToolOperation) => {
    switch (operation.type) {
      case "moveBlock":
        if (operation.state === "input-available" && operation.input) {
          return `Moving block "${operation.input.blockId}" to measure ${operation.input.newStartTime}`;
        }
        return "Preparing to move block...";
      case "chopAudio":
        if (operation.state === "input-available" && operation.input) {
          return `Chopping track "${operation.input.trackId}" (${operation.input.maxChops} chops, ${operation.input.nClusters} clusters)`;
        }
        return "Preparing to chop audio...";
      case "adjustSpeed":
        if (operation.state === "input-available" && operation.input) {
          return `Adjusting speed of block "${operation.input.blockId}" to ${operation.input.speedFactor}x`;
        }
        return "Preparing to adjust speed...";
      case "loop":
        if (operation.state === "input-available" && operation.input) {
          return `Looping block "${operation.input.blockId}" ${operation.input.times} times`;
        }
        return "Preparing to loop block...";
      case "text":
        return operation.text || "Processing text...";
      default:
        return "Processing...";
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex">
        {/* Vertical indicator */}
        <div className="flex flex-col items-center mr-4">
          {/* Circle indicator */}
          <div
            className={`w-3 h-3 rounded-full border-2 flex items-center justify-center transition-all duration-300 ${
              isComplete ? "border-green-400/60" : "border-opacity-60"
            }`}
            style={{
              borderColor: isComplete ? undefined : "rgba(250, 204, 21, 0.6)",
              backgroundColor: isComplete
                ? "rgba(34, 197, 94, 0.2)"
                : "rgba(250, 204, 21, 0.3)",
            }}
          >
            {isComplete && (
              <div className="w-1.5 h-1.5 rounded-full bg-green-400/80" />
            )}
            {isProcessing && (
              <div
                className="w-1.5 h-1.5 rounded-full animate-pulse"
                style={{ backgroundColor: "rgba(250, 204, 21, 0.8)" }}
              />
            )}
          </div>

          {/* Vertical line */}
          {!isLast && (
            <div
              className="w-0.5 flex-1 rounded-full mt-1"
              style={{
                backgroundColor: "rgba(250, 204, 21, 0.2)",
                minHeight: "20px",
              }}
            />
          )}
        </div>

        {/* Main content */}
        <div className="flex-1 flex items-start">
          <p className="text-sm text-white/60 leading-relaxed">
            {getOperationDescription(operation)}
          </p>
        </div>
      </div>
    </div>
  );
};

function EnhancedAIResponse({
  operations,
  isStreaming = false,
  className = "",
}: EnhancedAIResponseProps) {
  const [visibleOperations, setVisibleOperations] = useState<ToolOperation[]>(
    []
  );
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (operations.length === 0) return;

    const timer = setInterval(() => {
      if (currentIndex < operations.length) {
        setVisibleOperations((prev) => [...prev, operations[currentIndex]]);
        setCurrentIndex((prev) => prev + 1);
      }
    }, 800);

    return () => clearInterval(timer);
  }, [operations, currentIndex]);

  if (operations.length === 0) return null;

  return (
    <div className={`space-y-1 ${className}`}>
      {/* Header */}
      <div className="flex items-center space-x-2 mb-3">
        <div className="flex space-x-1">
          {[...Array(4)].map((_, i) => (
            <div
              key={i}
              className="w-1 h-1 rounded-full animate-pulse"
              style={{
                backgroundColor: colors[i % colors.length].replace(
                  "0.08",
                  "0.3"
                ),
                animationDelay: `${i * 0.2}s`,
              }}
            />
          ))}
        </div>
      </div>

      {/* Operations */}
      <div className="space-y-4">
        {visibleOperations.map((operation, index) => (
          <OperationCard
            key={operation.id}
            operation={operation}
            colorIndex={index}
            isLast={index === visibleOperations.length - 1}
          />
        ))}
      </div>

      {/* Streaming indicator */}
      {isStreaming && visibleOperations.length === operations.length && (
        <div className="flex justify-center py-3" />
      )}
    </div>
  );
}

export interface Track {
  track_id: string;
  filename: string;
  file_size: number;
  created_at: string;
  duration_seconds?: number;
  sample_rate?: number;
  processing_type?: string;
  channels?: number;
}

export interface AiSidebarProps {
  aiPrompt: string;
  setAiPrompt: (v: string) => void;
  onSubmit: (mode?: "beat" | "agent", provider?: "beatoven" | "mubert") => void;
  tracksRefreshTrigger?: number;
  isGeneratingTrack?: boolean;
  generationStatus?: string;
  onAddTrackToEditor?: (trackId: string, filename: string) => void;
  blocks?: MusicBlock[];
  onBlockMove?: (blockId: string, newTime: number) => void;
  onAddChopsToEditor?: (chops: any[], originalTrackName: string) => void;
  onChopAudio?: (
    trackId: string,
    options: {
      defaultLength?: number;
      minDuration?: number;
      nClusters?: number;
      maxChops?: number;
    }
  ) => Promise<{ chop_summaries?: any[]; metadata?: any }>;
  onSpeedAdjust?: (blockId: string, speedFactor: number) => void;
  onLoop?: (blockId: string, times: number) => void;
  onAgentBusyChange?: (busy: boolean) => void;
  onNewTrack?: (track: Track) => void;
  generatedCatalogTracks?: CatalogTrack[];
}

export default function AiSidebar({
  aiPrompt,
  setAiPrompt,
  onSubmit,
  tracksRefreshTrigger,
  isGeneratingTrack,
  generationStatus,
  onAddTrackToEditor,
  blocks = [],
  onBlockMove,
  onAddChopsToEditor,
  onChopAudio,
  onSpeedAdjust,
  onLoop,
  onAgentBusyChange,
  onNewTrack,
  generatedCatalogTracks = [],
}: AiSidebarProps) {
  const [mode, setMode] = useState<"beat" | "agent">("beat");
  const [activeTab, setActiveTab] = useState<"chat" | "tracks">("chat");
  const [musicProvider, setMusicProvider] = useState<"beatoven" | "mubert">(
    "beatoven"
  );
  const [aiModel, setAiModel] = useState<
    "gpt-4o-mini" | "gemini-2.5-flash" | "command-A-03"
  >("command-A-03");
  const placeholder =
    mode === "beat" ? "Describe a beat..." : "Ask the agent...";

  // Agent mode input state (separate from beatmaker aiPrompt)
  const [agentInput, setAgentInput] = useState("");

  // Tracks state - managed at AiSidebar level to persist across tab switches
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loadingTracks, setLoadingTracks] = useState(true);

  // Fetch tracks once on mount
  const fetchTracks = async () => {
    try {
      setLoadingTracks(true);
      const response = await authFetch(`${BACKEND_URL}/tracks`);
      if (!response.ok) {
        throw new Error(`Failed to fetch tracks: ${response.statusText}`);
      }
      const tracksData = await response.json();
      setTracks((prev) => {
        const fromApi = Array.isArray(tracksData) ? tracksData : [];
        const apiIds = new Set(fromApi.map((track: Track) => track.track_id));
        const localOnly = prev.filter(
          (track) =>
            !apiIds.has(track.track_id) &&
            !track.track_id.startsWith("premade_")
        );
        return [...localOnly, ...fromApi];
      });
    } catch (error) {
      console.error("Error fetching tracks:", error);
      setTracks((prev) => {
        const localOnly = prev.filter(
          (track) => !track.track_id.startsWith("premade_")
        );
        return [
          ...localOnly,
          ...PREMADE_TRACKS.map(
            ({ url: _url, premade: _premade, ...track }) => track
          ),
        ];
      });
    } finally {
      setLoadingTracks(false);
    }
  };

  useEffect(() => {
    fetchTracks();
  }, []);

  // When a new track is generated, add it to the list optimistically
  useEffect(() => {
    if (tracksRefreshTrigger && tracksRefreshTrigger > 0) {
      // Refetch to get the latest track
      fetchTracks();
    }
  }, [tracksRefreshTrigger]);

  useEffect(() => {
    if (!generatedCatalogTracks.length) return;
    setTracks((prev) => {
      const ids = new Set(prev.map((track) => track.track_id));
      const incoming = generatedCatalogTracks.filter(
        (track) => !ids.has(track.track_id)
      );
      return incoming.length ? [...incoming, ...prev] : prev;
    });
    setLoadingTracks(false);
  }, [generatedCatalogTracks]);

  // Handle track deletion
  const handleTrackDelete = (trackId: string) => {
    setTracks((prev) => prev.filter((t) => t.track_id !== trackId));
  };

  // Set up client-side AI chat for Agent mode
  const { messages, sendMessage, status, error, addToolResult } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/agent-chat",
    }),
    onToolCall: ({ toolCall }) => {
      console.log("🔧 Tool call received:", toolCall);

      // Check if it's a dynamic tool first for proper type narrowing
      if (toolCall.dynamic) {
        return;
      }

      if (toolCall.toolName === "moveBlock" && onBlockMove) {
        const { blockId, newStartTime } = toolCall.input as {
          blockId: string;
          newStartTime: number;
        };
        console.log(`📦 Moving block ${blockId} to time ${newStartTime}`);

        // Execute the block move
        onBlockMove(blockId, newStartTime);

        // Add the tool result
        addToolResult({
          tool: "moveBlock",
          toolCallId: toolCall.toolCallId,
          output: `Successfully moved block ${blockId} to time ${newStartTime} measures`,
        });
      }

      if (toolCall.toolName === "chopAudio") {
        const {
          trackId,
          defaultLength = 1.8,
          minDuration = 0.2,
          nClusters = 3,
          maxChops = 6,
        } = toolCall.input as {
          trackId: string;
          defaultLength?: number;
          minDuration?: number;
          nClusters?: number;
          maxChops?: number;
        };
        console.log(
          `🍞 Chopping audio track ${trackId} (max ${maxChops} chops, ${nClusters} clusters)`
        );

        // Execute the chop audio operation
        handleChopAudio(
          trackId,
          defaultLength,
          minDuration,
          nClusters,
          maxChops,
          toolCall.toolCallId
        );
      }

      if (toolCall.toolName === "adjustSpeed" && onSpeedAdjust) {
        const { blockId, speedFactor } = toolCall.input as {
          blockId: string;
          speedFactor: number;
        };
        console.log(
          `🏃 Speed adjusting block ${blockId} with factor ${speedFactor}`
        );

        // Execute the speed adjustment
        handleSpeedAdjust(blockId, speedFactor, toolCall.toolCallId);
      }

      if (toolCall.toolName === "loop" && onLoop) {
        const { blockId, times } = toolCall.input as {
          blockId: string;
          times: number;
        };
        console.log(`🔄 Looping block ${blockId} ${times} times`);

        // Execute the loop operation
        onLoop(blockId, times);

        // Add the tool result
        addToolResult({
          tool: "loop",
          toolCallId: toolCall.toolCallId,
          output: `Successfully looped block "${blockId}" ${times} times`,
        });
      }
    },
    onFinish: ({ message }) => {
      console.log("✅ Chat finished:", message);
    },
    onError: (error) => {
      console.error("❌ Chat error:", error);
    },
    messages: [],
  });

  const isLoading = status === "streaming" || status === "submitted";

  // Report busy state upward so overlay can follow agent lifecycle
  useEffect(() => {
    if (onAgentBusyChange) onAgentBusyChange(isLoading);
  }, [isLoading, onAgentBusyChange]);

  // When beat generation finishes successfully, automatically switch to catalog tab
  const prevIsGenerating = useRef<boolean>(false);
  useEffect(() => {
    if (mode === "beat" && prevIsGenerating.current && !isGeneratingTrack) {
      if (generationStatus?.toLowerCase().includes("completed")) {
        setActiveTab("tracks");
      }
    }
    prevIsGenerating.current = !!isGeneratingTrack;
  }, [isGeneratingTrack, mode, generationStatus]);
  // Handle speed adjustment operation
  const handleSpeedAdjust = async (
    blockId: string,
    speedFactor: number,
    toolCallId: string
  ) => {
    try {
      console.log(
        `🏃 Starting speed adjustment for block ${blockId} with factor ${speedFactor}`
      );

      // Call the speed adjustment callback
      if (onSpeedAdjust) {
        await onSpeedAdjust(blockId, speedFactor);
      }

      // Add success result
      addToolResult({
        tool: "adjustSpeed",
        toolCallId: toolCallId,
        output: `Successfully adjusted speed of block ${blockId} to ${speedFactor}x`,
      });
    } catch (error) {
      console.error("❌ Error adjusting speed:", error);

      // Add error result
      addToolResult({
        tool: "adjustSpeed",
        toolCallId: toolCallId,
        output: `Failed to adjust speed of block ${blockId}: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      });
    }
  };

  // Debug logging for status changes
  useEffect(() => {
    console.log("🎯 Chat status changed:", status);
    if (error) {
      console.error("❌ Chat error state:", error);
    }
  }, [status, error]);

  // Debug logging for messages changes
  useEffect(() => {
    console.log("💬 Messages updated:", messages);
  }, [messages]);

  // Handle chop audio operation
  const handleChopAudio = async (
    trackId: string,
    defaultLength: number,
    minDuration: number,
    nClusters: number,
    maxChops: number,
    toolCallId: string
  ) => {
    try {
      console.log(`🍞 Starting chop operation for track ${trackId}`);

      const result = onChopAudio
        ? await onChopAudio(trackId, {
            defaultLength,
            minDuration,
            nClusters,
            maxChops,
          })
        : await (async () => {
            const response = await authFetch(
              `${BACKEND_URL}/process/chop-audio`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  track_id: trackId,
                  default_length: defaultLength,
                  min_duration: minDuration,
                  n_clusters: nClusters,
                  max_chops: maxChops,
                }),
              }
            );
            if (!response.ok) {
              throw new Error(`Chop request failed: ${response.statusText}`);
            }
            return response.json();
          })();
      console.log("🍞 Chop result:", result);

      if (onAddChopsToEditor && result.chop_summaries && !onChopAudio) {
        onAddChopsToEditor(result.chop_summaries, `Track ${trackId} chops`);
      }

      // Create summary for AI
      const chopCount = result.chop_summaries?.length || 0;
      const totalDuration = result.metadata?.source_track_id || "unknown";
      const chopSummary =
        result.chop_summaries
          ?.map(
            (chop: any, index: number) =>
              `Chop ${index + 1}: ${chop.duration_seconds?.toFixed(2)}s (ID: ${
                chop.track_id
              })`
          )
          .join(", ") || "No chop details available";

      const toolResult = `Successfully chopped track ${trackId} into ${chopCount} segments (total duration: ${totalDuration}s).`;

      // Add the tool result
      addToolResult({
        tool: "chopAudio",
        toolCallId: toolCallId,
        output: toolResult,
      });
    } catch (error) {
      console.error("❌ Error chopping audio:", error);

      // Add error result
      addToolResult({
        tool: "chopAudio",
        toolCallId: toolCallId,
        output: `Failed to chop track ${trackId}: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      });
    }
  };

  // Handle form submission for different modes
  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === "agent") {
      // Use sendMessage for agent mode
      if (agentInput.trim()) {
        console.log("📤 Sending message to agent:", agentInput);
        console.log("📊 Current blocks state:", blocks);
        console.log("🎯 Chat status before send:", status);

        sendMessage(
          {
            text: agentInput,
          },
          {
            body: {
              blocks: blocks.toSorted((a, b) => a.startTime - b.startTime), // Include current blocks state with each message
              model: aiModel, // Include selected AI model
            },
          }
        );
        setAgentInput(""); // Clear input after sending
        // Notify parent to trigger any agent-mode side effects (e.g., overlay)
        onSubmit("agent");
      }
    } else {
      // Use existing beat generation for beatmaker mode
      onSubmit(mode, musicProvider);
    }
  };
  return (
    <div className="w-80 bg-background border-l border-border flex flex-col h-full overflow-y-auto">
      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as any)}
        className="flex-1 flex flex-col"
      >
        <div className="sticky top-0 z-20 border-b border-border bg-background">
          <TabsList className="grid w-full grid-cols-2 bg-background rounded-none h-12">
            {" "}
            <TabsTrigger
              value="chat"
              className="flex items-center gap-2 data-[state=active]:bg-white/5 data-[state=active]:text-white"
            >
              {" "}
              <MessageCircle className="w-4 h-4" /> Chat{" "}
            </TabsTrigger>{" "}
            <TabsTrigger
              value="tracks"
              className="flex items-center gap-2 data-[state=active]:bg-white/5  data-[state=active]:text-white"
            >
              {" "}
              <Music className="w-4 h-4" /> Catalog{" "}
            </TabsTrigger>{" "}
          </TabsList>
        </div>

        <TabsContent value="chat" className="flex-1 m-0 flex flex-col min-h-0">
          <div
            className={`flex-1 p-4 space-y-4 overflow-y-auto ${
              mode === "beat" && isGeneratingTrack ? "flex" : ""
            }`}
          >
            {/* Show agent chat messages when in agent mode (Enhanced UI) */}
            {mode === "agent" && messages.length > 0 && (
              <div className="space-y-3">
                {messages.map((message, msgIdx) => {
                  const toOperations = (): ToolOperation[] => {
                    const ops: ToolOperation[] = [];
                    message.parts?.forEach((part: any, index: number) => {
                      if (part.type === "text") {
                        ops.push({
                          id: `${message.id}-${index}`,
                          type: "text",
                          state: "complete",
                          text: part.text,
                        });
                        return;
                      }
                      if (part.type === "tool-moveBlock") {
                        ops.push({
                          id: `${message.id}-${index}`,
                          type: "moveBlock",
                          state: part.state,
                          input: part.input,
                          output: part.output,
                          errorText: part.errorText,
                        });
                        return;
                      }
                      if (part.type === "tool-chopAudio") {
                        ops.push({
                          id: `${message.id}-${index}`,
                          type: "chopAudio",
                          state: part.state,
                          input: part.input,
                          output: part.output,
                          errorText: part.errorText,
                        });
                        return;
                      }
                      if (part.type === "tool-adjustSpeed") {
                        ops.push({
                          id: `${message.id}-${index}`,
                          type: "adjustSpeed",
                          state: part.state,
                          input: part.input,
                          output: part.output,
                          errorText: part.errorText,
                        });
                        return;
                      }
                      if (part.type === "tool-loop") {
                        ops.push({
                          id: `${message.id}-${index}`,
                          type: "loop",
                          state: part.state,
                          input: part.input,
                          output: part.output,
                          errorText: part.errorText,
                        });
                        return;
                      }
                      // Ignore other internal parts (e.g., step-start)
                    });
                    return ops;
                  };

                  const isAssistant = message.role !== "user";
                  const lastMessageId = messages[messages.length - 1]?.id;
                  const isStreamingForThis =
                    isAssistant && isLoading && message.id === lastMessageId;

                  if (!isAssistant) {
                    return (
                      <div
                        key={message.id}
                        className="p-3 rounded-lg w-full bg-[#2F2F2F] border border-[#484848]"
                      >
                        <div className="text-gray-300 text-sm space-y-2">
                          {message.parts?.map((part: any, index: number) =>
                            part.type === "text" ? (
                              <div key={index}>{part.text}</div>
                            ) : null
                          )}
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div key={message.id} className="mr-8 p-3 rounded-lg">
                      <div className="text-[#B7BCC5] text-sm space-y-3">
                        {(() => {
                          const rows: Array<{
                            key: string;
                            content: any;
                            isComplete: boolean;
                            isProcessing: boolean;
                          }> = [];

                          message.parts?.forEach((part: any, index: number) => {
                            const makeRow = (
                              keySuffix: string,
                              content: any,
                              opts: {
                                isComplete?: boolean;
                                isProcessing?: boolean;
                              } = {}
                            ) => {
                              rows.push({
                                key: `${message.id}-${index}-${keySuffix}`,
                                content,
                                isComplete: !!opts.isComplete,
                                isProcessing: !!opts.isProcessing,
                              });
                            };

                            // Text accumulation is handled after the loop for natural streaming

                            const includeStreaming =
                              part.state === "input-streaming" ||
                              part.state === "input-available" ||
                              part.state === "output-available" ||
                              part.state === "output-error";
                            const includeInputAvailable =
                              part.state === "input-available" ||
                              part.state === "output-available" ||
                              part.state === "output-error";
                            const isSuccess =
                              part.state === "output-available" ||
                              part.state === "complete";
                            const isError = part.state === "output-error"; // styled as yellow per spec

                            if (part.type === "tool-moveBlock") {
                              if (includeStreaming) {
                                makeRow(
                                  "input-streaming",
                                  <div className="text-[#B7BCC5]">
                                    Preparing to move block
                                  </div>,
                                  { isProcessing: true }
                                );
                              }
                              if (includeInputAvailable) {
                                makeRow(
                                  "input-available",
                                  <div className="text-[#B7BCC5]">
                                    Moving block "{part.input.blockId}" to
                                    measure {part.input.newStartTime}
                                  </div>,
                                  { isProcessing: true }
                                );
                              }
                              if (isSuccess) {
                                makeRow(
                                  "output-available",
                                  <div className="text-[#B7BCC5]">
                                    {part.output}
                                  </div>,
                                  { isComplete: true }
                                );
                              }
                              if (isError) {
                                makeRow(
                                  "output-error",
                                  <div className="text-[#B7BCC5]">
                                    Error: {part.errorText}
                                  </div>,
                                  { isProcessing: false }
                                );
                              }
                              return;
                            }

                            if (part.type === "tool-chopAudio") {
                              if (includeStreaming) {
                                makeRow(
                                  "input-streaming",
                                  <div className="text-[#B7BCC5]">
                                    Preparing to chop audio
                                  </div>,
                                  { isProcessing: true }
                                );
                              }
                              if (includeInputAvailable) {
                                makeRow(
                                  "input-available",
                                  <div className="text-[#B7BCC5]">
                                    Chopping track "{part.input.trackId}" (max{" "}
                                    {part.input.maxChops} chops,{" "}
                                    {part.input.nClusters} clusters,{" "}
                                    {part.input.defaultLength}s length)
                                  </div>,
                                  { isProcessing: true }
                                );
                              }
                              if (isSuccess) {
                                makeRow(
                                  "output-available",
                                  <div className="text-[#B7BCC5]">
                                    {part.output}
                                  </div>,
                                  { isComplete: true }
                                );
                              }
                              if (isError) {
                                makeRow(
                                  "output-error",
                                  <div className="text-[#B7BCC5]">
                                    Error: {part.errorText}
                                  </div>,
                                  { isProcessing: false }
                                );
                              }
                              return;
                            }

                            if (part.type === "tool-adjustSpeed") {
                              if (includeStreaming) {
                                makeRow(
                                  "input-streaming",
                                  <div className="text-[#B7BCC5]">
                                    Preparing to adjust speed
                                  </div>,
                                  { isProcessing: true }
                                );
                              }
                              if (includeInputAvailable) {
                                makeRow(
                                  "input-available",
                                  <div className="text-[#B7BCC5]">
                                    Adjusting speed of block "
                                    {part.input.blockId}" to{" "}
                                    {part.input.speedFactor}x speed
                                  </div>,
                                  { isProcessing: true }
                                );
                              }
                              if (isSuccess) {
                                makeRow(
                                  "output-available",
                                  <div className="text-[#B7BCC5]">
                                    {part.output}
                                  </div>,
                                  { isComplete: true }
                                );
                              }
                              if (isError) {
                                makeRow(
                                  "output-error",
                                  <div className="text-[#B7BCC5]">
                                    Error: {part.errorText}
                                  </div>,
                                  { isProcessing: false }
                                );
                              }
                              return;
                            }

                            if (part.type === "tool-loop") {
                              if (includeStreaming) {
                                makeRow(
                                  "input-streaming",
                                  <div className="text-[#B7BCC5]">
                                    Preparing to loop block
                                  </div>,
                                  { isProcessing: true }
                                );
                              }
                              if (includeInputAvailable) {
                                makeRow(
                                  "input-available",
                                  <div className="text-[#B7BCC5]">
                                    Looping block "{part.input.blockId}"{" "}
                                    {part.input.times} times
                                  </div>,
                                  { isProcessing: true }
                                );
                              }
                              if (isSuccess) {
                                makeRow(
                                  "output-available",
                                  <div className="text-[#B7BCC5]">
                                    {part.output}
                                  </div>,
                                  { isComplete: true }
                                );
                              }
                              if (isError) {
                                makeRow(
                                  "output-error",
                                  <div className="text-[#B7BCC5]">
                                    Error: {part.errorText}
                                  </div>,
                                  { isProcessing: false }
                                );
                              }
                              return;
                            }
                          });

                          // After collecting tool rows, add a single text row that accumulates all text parts
                          let accumulatedText = "";
                          message.parts?.forEach((p: any) => {
                            if (p.type === "text") {
                              accumulatedText += p.text || "";
                            } else if (p.type === "text-delta") {
                              accumulatedText += p.textDelta || p.delta || "";
                            }
                          });
                          if (accumulatedText.trim().length > 0) {
                            rows.push({
                              key: `${message.id}-text-accum`,
                              content: (
                                <div className="text-[#B7BCC5] whitespace-pre-wrap break-words">
                                  {accumulatedText}
                                </div>
                              ),
                              isComplete: false,
                              isProcessing: !!isStreamingForThis,
                            });
                          }

                          return rows.map((row, flatIndex) => {
                            const isLast = flatIndex === rows.length - 1;
                            const isComplete = row.isComplete;
                            const isProcessing = row.isProcessing;
                            return (
                              <div key={row.key} className="space-y-2">
                                <div className="flex">
                                  <div className="flex flex-col items-center mr-4">
                                    <div
                                      className={`w-3 h-3 rounded-full border-2 flex items-center justify-center transition-all duration-300 ${
                                        isComplete
                                          ? "border-green-400/60"
                                          : "border-opacity-60"
                                      }`}
                                      style={{
                                        borderColor: isComplete
                                          ? undefined
                                          : "rgba(250, 204, 21, 0.6)",
                                        backgroundColor: isComplete
                                          ? "rgba(34, 197, 94, 0.2)"
                                          : "rgba(250, 204, 21, 0.3)",
                                      }}
                                    >
                                      {isComplete && (
                                        <div className="w-1.5 h-1.5 rounded-full bg-green-400/80" />
                                      )}
                                      {isProcessing && (
                                        <div
                                          className="w-1.5 h-1.5 rounded-full animate-pulse"
                                          style={{
                                            backgroundColor:
                                              "rgba(250, 204, 21, 0.8)",
                                          }}
                                        />
                                      )}
                                    </div>
                                    <div
                                      className="w-px flex-1 rounded-full mx-auto"
                                      style={{
                                        backgroundColor: isComplete
                                          ? "rgba(34, 197, 94, 0.2)"
                                          : "rgba(250, 204, 21, 0.2)",
                                        minHeight: 0,
                                      }}
                                    />
                                  </div>
                                  <div className="flex-1 flex items-start">
                                    {row.content}
                                  </div>
                                </div>
                              </div>
                            );
                          });
                        })()}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Show music loading state during beat generation */}
            {mode === "beat" && isGeneratingTrack && (
              <div className="m-auto">
                <MusicLoadingState className="py-4" />
              </div>
            )}

            {/* Show default state when in agent mode with no messages */}
            {mode === "agent" && messages.length === 0 && (
              <div className="bg-white/[0.02] rounded-lg p-4">
                <h3 className="text-white/50 font-medium text-sm mb-3">
                  Toolbox
                </h3>
                <ul className="space-y-2 text-[#B7BCC5]/60 text-sm">
                  <li className="flex items-start">
                    <span className="mr-2">•</span>
                    <span>Move blocks on the timeline</span>
                  </li>
                  <li className="flex items-start">
                    <span className="mr-2">•</span>
                    <span>Chop tracks into rhythmic segments</span>
                  </li>
                  <li className="flex items-start">
                    <span className="mr-2">•</span>
                    <span>Adjust playback speed of blocks</span>
                  </li>
                  <li className="flex items-start">
                    <span className="mr-2">•</span>
                    <span>Loop blocks multiple times</span>
                  </li>
                  <li className="flex items-start">
                    <span className="mr-2">•</span>
                    <span>Ask questions about your music arrangement</span>
                  </li>
                </ul>
              </div>
            )}
          </div>

          <div className="p-4">
            {mode === "agent" && error && (
              <p className="text-xs text-red-400 px-1 pb-2">{error.message}</p>
            )}
            {generationStatus && !isGeneratingTrack && (
              <p className="text-xs text-gray-400 px-1 pb-2">{generationStatus}</p>
            )}
            <form onSubmit={handleFormSubmit}>
              <div className="bg-[#2F2F2F] rounded-lg p-3 space-y-2 border border-[#484848]">
                <Input
                  value={mode === "agent" ? agentInput : aiPrompt}
                  onChange={(e) => {
                    if (mode === "agent") {
                      setAgentInput(e.target.value);
                    } else {
                      setAiPrompt(e.target.value);
                    }
                  }}
                  placeholder={placeholder}
                  className="bg-transparent border-none text-white placeholder-gray-500 p-0 focus-visible:ring-0"
                  onKeyPress={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleFormSubmit(e);
                    }
                  }}
                />

                {/* Submit Footer with drop-up mode switch */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <DropdownMenu>
                      <DropdownMenuTrigger>
                        {mode === "beat" ? (
                          <div className="flex items-center gap-1">
                            <WandSparkles className="w-4 h-4" />
                            <span className="text-xs">Beatmaker</span>
                            <ChevronUp className="w-3 h-3" />
                          </div>
                        ) : (
                          <div className="flex items-center gap-1">
                            <ArrowUp className="w-4 h-4" />
                            <span className="text-xs">Agent</span>
                            <ChevronUp className="w-3 h-3" />
                          </div>
                        )}
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        side="top"
                        align="start"
                        sideOffset={6}
                        className="bg-[#2F2F2F] border-[#484848]"
                      >
                        <DropdownMenuItem onClick={() => setMode("beat")}>
                          <WandSparkles className="w-4 h-4" />
                          <span>Beatmaker</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setMode("agent")}>
                          <ArrowUp className="w-4 h-4" />
                          <span>Agent</span>
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>

                    {/* Music Provider Dropdown - only show in beatmaker mode */}
                    {mode === "beat" && (
                      <DropdownMenu>
                        <DropdownMenuTrigger>
                          <div className="flex items-center gap-1 text-xs text-gray-400">
                            <Music className="w-3 h-3" />
                            <span>
                              {musicProvider === "beatoven"
                                ? "Beatoven"
                                : "Mubert"}
                            </span>
                            <ChevronUp className="w-2.5 h-2.5" />
                          </div>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                          side="top"
                          align="center"
                          sideOffset={6}
                          className="bg-[#2F2F2F] border-[#484848]"
                        >
                          <DropdownMenuItem
                            onClick={() => setMusicProvider("beatoven")}
                          >
                            <span>Beatoven</span>
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            disabled
                            className="opacity-50 cursor-not-allowed"
                          >
                            <span>Mubert</span>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}

                    {/* AI Model Dropdown - only show in agent mode */}
                    {mode === "agent" && (
                      <DropdownMenu>
                        <DropdownMenuTrigger>
                          <div className="flex items-center gap-1 text-xs text-gray-400">
                            <WandSparkles className="w-3 h-3" />
                            <span>{aiModel}</span>
                            <ChevronUp className="w-2.5 h-2.5" />
                          </div>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                          side="top"
                          align="center"
                          sideOffset={6}
                          className="bg-[#2F2F2F] border-[#484848]"
                        >
                          <DropdownMenuItem
                            onClick={() => setAiModel("command-A-03")}
                          >
                            <span>command-a-03-2025</span>
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            disabled
                            className="opacity-50 cursor-not-allowed"
                          >
                            <span>gpt-4o-mini</span>
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            disabled
                            className="opacity-50 cursor-not-allowed"
                          >
                            <span>gemini-2.5-flash</span>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>

                  <Button
                    type="submit"
                    variant="ghost"
                    size="sm"
                    className={`h-8 w-8 p-0 rounded-md transition-all ${
                      (mode === "agent" && (!agentInput.trim() || isLoading)) ||
                      (mode === "beat" &&
                        (!aiPrompt.trim() || isGeneratingTrack))
                        ? "text-gray-400 hover:text-white"
                        : "bg-gradient-to-r from-pink-500 via-rose-500 to-orange-500 text-white hover:opacity-80"
                    }`}
                    disabled={
                      (mode === "agent" && (!agentInput.trim() || isLoading)) ||
                      (mode === "beat" &&
                        (!aiPrompt.trim() || isGeneratingTrack))
                    }
                    aria-label={
                      mode === "beat"
                        ? "Submit to beatmaker"
                        : "Submit to agent"
                    }
                    title={
                      mode === "beat"
                        ? "Submit to beatmaker"
                        : "Submit to agent"
                    }
                  >
                    {mode === "beat" ? (
                      <WandSparkles className="w-4 h-4" />
                    ) : (
                      <ArrowUp className="w-4 h-4" />
                    )}
                  </Button>
                </div>
              </div>
            </form>
          </div>
        </TabsContent>

        <TabsContent
          value="tracks"
          className="flex-1 m-0 flex flex-col min-h-0"
        >
          <Catalog
            tracks={tracks}
            loading={loadingTracks}
            onAddToEditor={onAddTrackToEditor}
            onTrackDelete={handleTrackDelete}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
