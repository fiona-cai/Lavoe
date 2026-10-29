"use client";

import { useState, useEffect, useRef } from "react";
import { X, Wand2, Loader2, ArrowUp } from "lucide-react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { authFetch } from "@/lib/authFetch";
import { BACKEND_URL } from "@/lib/backendUrl";

export interface GeneratedBeat {
  main: {
    id: string;
    blob: Blob;
    url: string;
  };
  stems: {
    bass: { id: string; blob: Blob; url: string };
    chords: { id: string; blob: Blob; url: string };
    melody: { id: string; blob: Blob; url: string };
    percussion: { id: string; blob: Blob; url: string };
  };
}

export interface BeatGenerationModalProps {
  isOpen: boolean;
  onClose: () => void;
  prompt: string;
  onGenerate: (prompt: string) => Promise<GeneratedBeat>;
}

export function BeatGenerationModal({
  isOpen,
  onClose,
  prompt,
  onGenerate,
}: BeatGenerationModalProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedBeat, setGeneratedBeat] = useState<GeneratedBeat | null>(null);
  const [selectedAudio, setSelectedAudio] = useState<{ type: "main" | keyof GeneratedBeat["stems"]; data: { id: string; blob: Blob; url: string } } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && prompt && !generatedBeat && !isGenerating) {
      handleGenerate();
    }
  }, [isOpen, prompt]);

  const handleGenerate = async () => {
    setIsGenerating(true);
    setError(null);

    try {
      const beat = await onGenerate(prompt);
      setGeneratedBeat(beat);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate beat");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleMagicWandClick = (type: "main" | keyof GeneratedBeat["stems"], data: { id: string; blob: Blob; url: string }) => {
    console.log(`🪄 Magic wand clicked for ${type} beat, ID: ${data.id}`);
    setSelectedAudio({ type, data });
  };

  const handleExitAgentMode = (modifiedBlob?: Blob) => {
    if (modifiedBlob && selectedAudio && generatedBeat) {
      // Replace the audio with modified version
      const newUrl = URL.createObjectURL(modifiedBlob);

      if (selectedAudio.type === "main") {
        setGeneratedBeat({
          ...generatedBeat,
          main: {
            ...generatedBeat.main,
            blob: modifiedBlob,
            url: newUrl,
          },
        });
      } else {
        setGeneratedBeat({
          ...generatedBeat,
          stems: {
            ...generatedBeat.stems,
            [selectedAudio.type]: {
              ...generatedBeat.stems[selectedAudio.type],
              blob: modifiedBlob,
              url: newUrl,
            },
          },
        });
      }
    }

    setSelectedAudio(null);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-background border border-border rounded-lg shadow-xl max-w-7xl w-full max-h-[95vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-lg font-semibold">Beat Generation</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-secondary rounded transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          {isGenerating && (
            <div className="flex flex-col items-center justify-center py-16 space-y-4">
              <Loader2 className="w-12 h-12 animate-spin text-primary" />
              <p className="text-muted-foreground">Generating beat...</p>
              <p className="text-sm text-muted-foreground italic">"{prompt}"</p>
            </div>
          )}

          {error && (
            <div className="flex flex-col items-center justify-center py-16 space-y-4">
              <p className="text-destructive">Error: {error}</p>
              <button
                onClick={handleGenerate}
                className="px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors"
              >
                Retry
              </button>
            </div>
          )}

          {!isGenerating && !error && generatedBeat && !selectedAudio && (
            <div className="space-y-6">
              <div className="text-sm text-muted-foreground mb-4">
                Generated from: "{prompt}"
              </div>

              {/* Main Track */}
              <AudioCard
                label="Main Track"
                audioUrl={generatedBeat.main.url}
                onMagicWandClick={() => handleMagicWandClick("main", generatedBeat.main)}
                color="bg-blue-500"
              />

              {/* Stems */}
              <div className="grid grid-cols-2 gap-4">
                <AudioCard
                  label="Bass"
                  audioUrl={generatedBeat.stems.bass.url}
                  onMagicWandClick={() => handleMagicWandClick("bass", generatedBeat.stems.bass)}
                  color="bg-cyan-500"
                />
                <AudioCard
                  label="Chords"
                  audioUrl={generatedBeat.stems.chords.url}
                  onMagicWandClick={() => handleMagicWandClick("chords", generatedBeat.stems.chords)}
                  color="bg-green-500"
                />
                <AudioCard
                  label="Melody"
                  audioUrl={generatedBeat.stems.melody.url}
                  onMagicWandClick={() => handleMagicWandClick("melody", generatedBeat.stems.melody)}
                  color="bg-purple-500"
                />
                <AudioCard
                  label="Percussion"
                  audioUrl={generatedBeat.stems.percussion.url}
                  onMagicWandClick={() => handleMagicWandClick("percussion", generatedBeat.stems.percussion)}
                  color="bg-orange-500"
                />
              </div>
            </div>
          )}

          {!isGenerating && !error && generatedBeat && selectedAudio && (
            <AgentEditMode
              audioType={selectedAudio.type}
              audioBlob={selectedAudio.data.blob}
              audioUrl={selectedAudio.data.url}
              audioId={selectedAudio.data.id}
              onExit={handleExitAgentMode}
            />
          )}
        </div>
      </div>
    </div>
  );
}

interface AudioCardProps {
  label: string;
  audioUrl: string;
  onMagicWandClick: () => void;
  color: string;
}

function AudioCard({ label, audioUrl, onMagicWandClick, color }: AudioCardProps) {
  return (
    <div className="border border-border rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`w-3 h-3 rounded-full ${color}`} />
          <span className="font-medium">{label}</span>
        </div>
        <button
          onClick={onMagicWandClick}
          className="p-2 hover:bg-secondary rounded transition-colors"
          title="Edit with AI"
        >
          <Wand2 className="w-4 h-4" />
        </button>
      </div>
      <audio controls className="w-full" src={audioUrl} />
    </div>
  );
}

interface AgentEditModeProps {
  audioType: string;
  audioBlob: Blob;
  audioUrl: string;
  audioId: string;
  onExit: (modifiedBlob?: Blob) => void;
}

function AgentEditMode({ audioType, audioBlob, audioUrl, audioId, onExit }: AgentEditModeProps) {
  const [chatInput, setChatInput] = useState("");
  const [currentAudioUrl, setCurrentAudioUrl] = useState(audioUrl);
  const [currentBlob, setCurrentBlob] = useState(audioBlob);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Handle speed adjustment (copied from AiSidebar)
  const handleSpeedAdjust = async (speedFactor: number, toolCallId: string) => {
    try {
      console.log(`🏃 Starting speed adjustment for ${audioType} to ${speedFactor}x`);

      // Call backend to adjust speed
      const response = await authFetch(`${BACKEND_URL}/process/speed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          track_id: audioId,
          speed_factor: speedFactor,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to adjust speed");
      }

      const result = await response.json();
      console.log("✅ Speed adjusted, new track ID:", result.track_id);

      // Download the modified audio
      const downloadResponse = await authFetch(
        `${BACKEND_URL}/tracks/${result.track_id}/download`
      );
      const downloadData = await downloadResponse.json();
      const audioResponse = await fetch(downloadData.url);
      const newBlob = await audioResponse.blob();

      // Update the audio on the left side
      const newUrl = URL.createObjectURL(newBlob);
      setCurrentAudioUrl(newUrl);
      setCurrentBlob(newBlob);

      console.log("🎵 Audio updated on left side");

      // Add success result
      addToolResult({
        tool: "adjustSpeed",
        toolCallId: toolCallId,
        output: `Successfully adjusted speed of ${audioType} to ${speedFactor}x`,
      });
    } catch (error) {
      console.error("❌ Error adjusting speed:", error);

      // Add error result
      addToolResult({
        tool: "adjustSpeed",
        toolCallId: toolCallId,
        output: `Failed to adjust speed: ${error instanceof Error ? error.message : "Unknown error"}`,
      });
    }
  };

  // Initialize AI chat (same as AiSidebar)
  const { messages, sendMessage, status, addToolResult } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/agent-chat",
    }),
    onToolCall: async ({ toolCall }) => {
      console.log("🔧 Tool call received:", toolCall);

      if (toolCall.dynamic) return;

      if (toolCall.toolName === "adjustSpeed") {
        const { speedFactor } = toolCall.input as {
          blockId?: string;
          speedFactor: number;
        };
        console.log(`🏃 Speed adjusting ${audioType} with factor ${speedFactor}`);

        // Execute the speed adjustment
        handleSpeedAdjust(speedFactor, toolCall.toolCallId);
      }
    },
    onFinish: ({ message }) => {
      console.log("✅ Chat finished:", message);
    },
    onError: (error) => {
      console.error("❌ Chat error:", error);
    },
    messages: [],
    initialMessages: [
      {
        id: 'context',
        role: 'system',
        content: `IMPORTANT CONTEXT:
- You are editing the ${audioType} audio track
- The track ID is: ${audioId}
- When using adjustSpeed tool, ALWAYS use blockId="${audioId}"
- DO NOT ask the user for any IDs - you already have everything you need
- Apply all changes immediately without asking for confirmation
- The blockId parameter for ALL tools is: "${audioId}"`,
      },
    ],
  });

  const isLoading = status === "streaming" || status === "submitted";

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || isLoading) return;

    console.log("📤 Sending message to agent:", chatInput);
    console.log("🎯 Audio context:", { audioId, audioType });

    // Send message with audio context in body (same pattern as AiSidebar)
    // Include a reminder about the blockId in the user's message
    const messageWithContext = `${chatInput}\n\n[Context: Editing ${audioType} track with ID: ${audioId}. Use blockId="${audioId}" for all operations.]`;

    sendMessage(
      { text: messageWithContext },
      {
        body: {
          trackId: audioId, // Include track ID in body
          audioType: audioType,
          blockId: audioId, // Explicitly provide blockId
          model: "command-A-03", // Use same model as AiSidebar
        },
      }
    );

    setChatInput("");
  };

  const handleDoneEditing = () => {
    onExit(currentBlob);
  };

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="grid grid-cols-2 gap-6 h-full min-h-[600px]">
      {/* Left: Audio Preview */}
      <div className="border border-border rounded-lg p-6 space-y-4 flex flex-col">
        <h3 className="font-semibold text-lg capitalize">Editing: {audioType}</h3>
        <audio controls className="w-full" src={currentAudioUrl} key={currentAudioUrl} />
        <div className="text-sm text-muted-foreground flex-1">
          Ask the AI to modify this audio. Try:
          <ul className="list-disc list-inside mt-2 space-y-1">
            <li>"Make it 1.5x faster"</li>
            <li>"Slow it down to 0.8x speed"</li>
            <li>"Speed it up by 2x"</li>
          </ul>
        </div>
        <button
          onClick={handleDoneEditing}
          className="w-full px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors font-medium"
        >
          Done Editing
        </button>
      </div>

      {/* Right: AI Chat (same structure as AiSidebar) */}
      <div className="border border-border rounded-lg flex flex-col">
        <div className="p-4 border-b border-border">
          <h3 className="font-semibold text-lg">AI Assistant</h3>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.length === 0 && (
            <div className="text-sm text-muted-foreground text-center py-8">
              Start by describing how you want to modify the audio
            </div>
          )}

          {messages.map((message) => {
            const isAssistant = message.role !== "user";
            const lastMessageId = messages[messages.length - 1]?.id;
            const isStreamingForThis = isAssistant && isLoading && message.id === lastMessageId;

            if (!isAssistant) {
              // User message (same styling as AiSidebar)
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

            // Assistant message
            return (
              <div key={message.id} className="mr-8 p-3 rounded-lg">
                <div className="text-[#B7BCC5] text-sm space-y-2">
                  {message.parts?.map((part: any, index: number) => {
                    if (part.type === "text") {
                      return <div key={index}>{part.text}</div>;
                    }
                    if (part.type === "tool-adjustSpeed") {
                      const isProcessing = part.state === "input-streaming" || part.state === "input-available";
                      const isSuccess = part.state === "output-available";
                      const isError = part.state === "output-error";

                      return (
                        <div key={index} className="space-y-1">
                          {isProcessing && (
                            <div className="flex items-center gap-2 text-yellow-400">
                              <Loader2 className="w-3 h-3 animate-spin" />
                              <span>Adjusting speed to {part.input?.speedFactor}x...</span>
                            </div>
                          )}
                          {isSuccess && (
                            <div className="text-green-400">
                              ✓ {part.output}
                            </div>
                          )}
                          {isError && (
                            <div className="text-red-400">
                              ✗ {part.output || part.errorText}
                            </div>
                          )}
                        </div>
                      );
                    }
                    return null;
                  })}
                </div>
              </div>
            );
          })}

          <div ref={messagesEndRef} />
        </div>

        {/* Input (same as AiSidebar) */}
        <div className="p-4 border-t border-border">
          <form onSubmit={handleSubmit} className="flex gap-2">
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Describe the changes you want..."
              className="flex-1 px-3 py-2 bg-background border border-border rounded text-sm focus:outline-none focus:border-primary"
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={!chatInput.trim() || isLoading}
              className="px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ArrowUp className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
