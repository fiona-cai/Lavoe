export type TimelineBlock = {
  id: string;
  name: string;
  startTime: number;
  duration: number;
  track?: number;
  trackId?: string;
};

export type AgentToolCall = {
  name: "moveBlock" | "loop" | "adjustSpeed" | "chopAudio";
  input: Record<string, unknown>;
};

export type LocalAgentPlan = {
  text: string;
  tools: AgentToolCall[];
};

function latestUserText(messages: any[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message?.role !== "user") continue;
    if (typeof message.content === "string") return message.content;
    const parts = Array.isArray(message.parts) ? message.parts : [];
    return parts
      .filter((part: any) => part?.type === "text")
      .map((part: any) => part.text || "")
      .join("\n")
      .trim();
  }
  return "";
}

function hasCompletedToolOutput(messages: any[]): boolean {
  const last = messages[messages.length - 1];
  if (!last) return false;
  const parts = Array.isArray(last.parts) ? last.parts : [];
  return parts.some(
    (part: any) =>
      typeof part?.type === "string" &&
      part.type.startsWith("tool-") &&
      (part.state === "output-available" || part.output)
  );
}

function describeBlocks(blocks: TimelineBlock[]): string {
  if (!blocks.length) {
    return "The timeline is empty. Add a track from Catalog, then ask me to loop, move, speed up, or chop it.";
  }
  return blocks
    .map(
      (block) =>
        `- ${block.name} (${block.id}) at measure ${block.startTime}, lasting ${block.duration} measures`
    )
    .join("\n");
}

function scoreBlock(block: TimelineBlock, query: string): number {
  const hay = `${block.name} ${block.id} ${block.trackId || ""}`.toLowerCase();
  const words = query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 2);
  let score = 0;
  for (const word of words) {
    if (hay.includes(word)) score += 3;
  }
  if (/drum|perc|kick|beat/.test(query) && /drum|perc|lofi/.test(hay)) score += 6;
  if (/bass/.test(query) && /bass/.test(hay)) score += 6;
  if (/chord|rhodes|key|pad/.test(query) && /chord|rhodes/.test(hay)) score += 6;
  if (/melody|lead|air/.test(query) && /melody|lead|airy/.test(hay)) score += 6;
  return score;
}

function pickBlock(
  blocks: TimelineBlock[],
  text: string
): TimelineBlock | null {
  if (!blocks.length) return null;
  const ranked = [...blocks].sort(
    (a, b) => scoreBlock(b, text) - scoreBlock(a, text)
  );
  if (scoreBlock(ranked[0], text) > 0) return ranked[0];
  if (/this|that|it|the (track|block|clip|loop)/.test(text.toLowerCase())) {
    return ranked[0];
  }
  return blocks.length === 1 ? blocks[0] : ranked[0];
}

function parseNumber(text: string, fallback: number): number {
  const named: Record<string, number> = {
    once: 1,
    twice: 2,
    "two times": 2,
    "three times": 3,
    "four times": 4,
    "five times": 5,
    "eight times": 8,
  };
  const lower = text.toLowerCase();
  for (const [phrase, value] of Object.entries(named)) {
    if (lower.includes(phrase)) return value;
  }
  const match = lower.match(/(\d+(?:\.\d+)?)/);
  if (!match) return fallback;
  return Number(match[1]);
}

function parseMeasure(text: string, fallback: number): number {
  const match = text.toLowerCase().match(
    /(?:measure|bar|beat|time|at)\s*(\d+(?:\.\d+)?)/
  );
  if (match) return Number(match[1]);
  const bare = text.match(/\b(\d+(?:\.\d+)?)\b/);
  return bare ? Number(bare[1]) : fallback;
}

export function planLocalAgent(
  messages: any[],
  blocks: TimelineBlock[] = []
): LocalAgentPlan {
  if (hasCompletedToolOutput(messages)) {
    return {
      text: "Done. The timeline is updated — hit play to hear it.",
      tools: [],
    };
  }

  const text = latestUserText(messages).trim();
  const lower = text.toLowerCase();
  const sorted = [...blocks].sort((a, b) => a.startTime - b.startTime);

  if (!text) {
    return {
      text: `I can loop, move, speed up, or chop clips.\n\n${describeBlocks(sorted)}`,
      tools: [],
    };
  }

  if (
    /what('?s| is)|show|list|timeline|here now|current/.test(lower) &&
    !/loop|move|chop|speed/.test(lower)
  ) {
    return {
      text: `Here's what's on the timeline:\n${describeBlocks(sorted)}`,
      tools: [],
    };
  }

  if (!sorted.length) {
    return {
      text: "Add a clip from Catalog first, then I can loop, move, speed, or chop it.",
      tools: [],
    };
  }

  const target = pickBlock(sorted, lower);
  if (!target) {
    return {
      text: `I couldn't tell which clip you mean. Current clips:\n${describeBlocks(sorted)}`,
      tools: [],
    };
  }

  if (/chop|slice|split|break/.test(lower)) {
    return {
      text: `Chopping "${target.name}" into rhythmic hits.`,
      tools: [
        {
          name: "chopAudio",
          input: {
            trackId: target.trackId || target.id,
            defaultLength: 1.8,
            minDuration: 0.2,
            nClusters: 3,
            maxChops: 6,
          },
        },
      ],
    };
  }

  if (/loop|repeat|duplicate|copy/.test(lower)) {
    const times = Math.max(1, Math.min(10, Math.round(parseNumber(lower, 4))));
    return {
      text: `Looping "${target.name}" ${times} times.`,
      tools: [{ name: "loop", input: { blockId: target.id, times } }],
    };
  }

  if (/slow|half speed|0\.5/.test(lower)) {
    return {
      text: `Slowing "${target.name}" to half speed.`,
      tools: [
        { name: "adjustSpeed", input: { blockId: target.id, speedFactor: 0.5 } },
      ],
    };
  }

  if (/speed|faster|slower|2x|double/.test(lower)) {
    const factor = /slow/.test(lower)
      ? 0.5
      : Math.max(0.1, Math.min(10, parseNumber(lower, 2)));
    return {
      text: `Setting "${target.name}" to ${factor}x speed.`,
      tools: [
        {
          name: "adjustSpeed",
          input: { blockId: target.id, speedFactor: factor },
        },
      ],
    };
  }

  if (/after|behind|following/.test(lower)) {
    const others = sorted.filter((block) => block.id !== target.id);
    const anchor =
      others.find((block) => scoreBlock(block, lower) > 0) ||
      others[others.length - 1];
    if (anchor) {
      const newStartTime = anchor.startTime + anchor.duration;
      return {
        text: `Moving "${target.name}" to start after "${anchor.name}".`,
        tools: [
          {
            name: "moveBlock",
            input: { blockId: target.id, newStartTime },
          },
        ],
      };
    }
  }

  if (/move|place|shift|start at|put/.test(lower)) {
    const newStartTime = parseMeasure(lower, target.startTime + 4);
    return {
      text: `Moving "${target.name}" to measure ${newStartTime}.`,
      tools: [
        {
          name: "moveBlock",
          input: { blockId: target.id, newStartTime },
        },
      ],
    };
  }

  if (/arrange|spread|line up|sequence/.test(lower)) {
    let cursor = 1;
    const tools: AgentToolCall[] = sorted.map((block) => {
      const call: AgentToolCall = {
        name: "moveBlock",
        input: { blockId: block.id, newStartTime: cursor },
      };
      cursor += block.duration;
      return call;
    });
    return {
      text: "Lining the clips up one after another.",
      tools,
    };
  }

  return {
    text: `I can loop, move, speed up, or chop "${target.name}". Try "loop the drums 4 times" or "move bass to measure 8".\n\n${describeBlocks(sorted)}`,
    tools: [],
  };
}
