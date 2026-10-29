import { openai } from "@ai-sdk/openai";
import { google } from "@ai-sdk/google";
import { cohere } from "@ai-sdk/cohere";
import {
  streamText,
  tool,
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
} from "ai";
import { z } from "zod";
import { NextRequest } from "next/server";
import { planLocalAgent } from "@/lib/localMusicAgent";

const moveBlock = tool({
  description:
    "Move a music block to a new start time in the timeline. Useful for rearranging the composition.",
  inputSchema: z.object({
    blockId: z.string().describe("The ID of the block to move"),
    newStartTime: z
      .number()
      .min(0)
      .describe("The new start time position in measures (0-based)"),
  }),
});

const chopAudio = tool({
  description:
    "Chop an audio track into segments based on onset detection. Creates multiple new blocks from the original track. Very useful for creating drum loops or breaking down complex audio. Automatically picks representative chops from each cluster.",
  inputSchema: z.object({
    trackId: z.string().describe("The ID of the track to chop"),
    defaultLength: z
      .number()
      .min(0.1)
      .max(10)
      .default(1.8)
      .describe("Default length for chops in seconds (default: 1.8)"),
    minDuration: z
      .number()
      .min(0.05)
      .max(2)
      .default(0.2)
      .describe("Minimum duration for chops in seconds (default: 0.2)"),
    nClusters: z
      .number()
      .min(1)
      .max(20)
      .default(3)
      .describe("Number of clusters for grouping similar chops (default: 3)"),
    maxChops: z
      .number()
      .min(1)
      .max(50)
      .default(6)
      .describe(
        "Maximum number of chops to return, picks best representatives from each cluster (default: 6)"
      ),
  }),
});

const adjustSpeed = tool({
  description:
    "Adjust the speed of an audio block. Makes the audio faster or slower while maintaining pitch. Creates a new track with the adjusted speed and updates the block in place.",
  inputSchema: z.object({
    blockId: z
      .string()
      .describe("The ID of the block to speed up or slow down"),
    speedFactor: z
      .number()
      .min(0.1)
      .max(10)
      .describe(
        "Speed multiplication factor (1.0 = normal, 2.0 = 2x faster, 0.5 = 2x slower)"
      ),
  }),
});

const loop = tool({
  description:
    "Loop/duplicate a music block multiple times, placing each copy right after the previous one on the timeline. Useful for creating repetitive patterns or extending musical phrases.",
  inputSchema: z.object({
    blockId: z.string().describe("The ID of the block to loop"),
    times: z
      .number()
      .min(1)
      .max(10)
      .describe("Number of times to loop the block (1-10)"),
  }),
});

const tools = { moveBlock, chopAudio, adjustSpeed, loop };

function resolveModel(model: string) {
  switch (model) {
    case "gemini-2.5-flash":
      return process.env.GOOGLE_GENERATIVE_AI_API_KEY
        ? google("gemini-2.5-flash")
        : null;
    case "command-A-03":
      return process.env.COHERE_API_KEY ? cohere("command-a-03-2025") : null;
    case "gpt-4o-mini":
    default:
      return process.env.OPENAI_API_KEY ? openai("gpt-4o-mini") : null;
  }
}

function localAgentResponse(messages: any[], blocks: any[]) {
  const plan = planLocalAgent(messages, blocks || []);
  const stream = createUIMessageStream({
    execute({ writer }) {
      const textId = crypto.randomUUID();
      writer.write({ type: "start" });
      writer.write({ type: "start-step" });
      writer.write({ type: "text-start", id: textId });
      writer.write({ type: "text-delta", id: textId, delta: plan.text });
      writer.write({ type: "text-end", id: textId });
      for (const call of plan.tools) {
        const toolCallId = `tool_${crypto.randomUUID()}`;
        writer.write({
          type: "tool-input-start",
          toolCallId,
          toolName: call.name,
        });
        writer.write({
          type: "tool-input-available",
          toolCallId,
          toolName: call.name,
          input: call.input,
        });
      }
      writer.write({ type: "finish-step" });
      writer.write({ type: "finish" });
    },
  });
  return createUIMessageStreamResponse({ stream });
}

export async function POST(req: NextRequest) {
  let body: any = {};
  try {
    body = await req.json();
    const { messages, blocks, model = "gpt-4o-mini" } = body;

    if (!messages || !Array.isArray(messages)) {
      return new Response("Invalid messages format", { status: 400 });
    }

    const selectedModel = resolveModel(model);
    if (!selectedModel) {
      return localAgentResponse(messages, blocks);
    }

    const blocksContext =
      blocks && blocks.length > 0
        ? `
Current blocks in the timeline:
${blocks
  .map(
    (block: any) =>
      `- Block "${block.name}" (ID: ${block.id}) at time ${
        block.startTime
      } measures, duration ${block.duration} measures, track index ${
        block.track
      }${block.trackId ? `, track ID: ${block.trackId}` : ""}`
  )
  .join("\n")}
`
        : "No blocks currently in the timeline.";

    const result = await streamText({
      model: selectedModel,
      messages: convertToModelMessages(messages),
      tools,
      system: `You are Lavoe Agent, an AI assistant specialized in editing and arranging music compositions. You can help users rearrange their music by moving blocks around the timeline.

**Current Timeline State:**
${blocksContext}

**Available Tools:**
1. **Move Block** - Move any block to a new start time position on the timeline
2. **Chop Audio** - Chop an audio track into segments based on onset detection, automatically adding the chops to the timeline
3. **Adjust Speed** - Speed up or slow down an audio block while maintaining pitch (creates a new track and updates the block in place)
4. **Loop** - Duplicate a block multiple times, placing each copy right after the previous one

**Instructions:**
- Help users rearrange their music composition by moving blocks
- Use chopAudio to break down complex audio into manageable segments (use the track ID, not track index)
- Use adjustSpeed to speed up or slow down blocks (1.0 = normal, 2.0 = 2x faster, 0.5 = 2x slower)
- Use loop to duplicate blocks multiple times, creating repetitive patterns
- Always refer to blocks by their name and ID for clarity
- When suggesting moves, consider musical timing and structure
- Explain your reasoning for block placement suggestions
- Be conversational and helpful with music arrangement advice
- Timeline is measured in measures (beats), with each measure representing a musical unit
- Always confirm the action you're taking when moving, chopping, adjusting, or looping blocks
- When chopping audio, explain what you're doing and why the parameters were chosen (default: 6 max chops, 3 clusters)
- When adjusting speed, explain the effect (faster/slower) and why you chose that speed factor
- When looping blocks, explain how many copies you're creating and why
- For chopAudio tool, use the track ID (not track index) from the block information
- For adjustSpeed tool, use the block ID (the tool will automatically handle finding the track)
- For loop tool, use the block ID and specify how many times to repeat it (1-10 times)

Be creative with arrangements and provide musical insight along with the technical changes!`,
    });

    return result.toUIMessageStreamResponse({
      onError: (error) =>
        error instanceof Error ? error.message : "Agent request failed",
    });
  } catch (error) {
    console.error("Agent Chat API error:", error);
    if (Array.isArray(body?.messages)) {
      return localAgentResponse(body.messages, body.blocks || []);
    }
    return new Response(
      JSON.stringify({
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
