// Initial deployment through Cloudflare Git integration
const SERVER_INFO = {
  name: "chatgpt-music-mcp",
  version: "1.0.0"
};

const TOOLS = [
  {
    name: "generate_music_idea",
    description:
      "Create a music idea based on genre, mood, theme, and instruments.",
    inputSchema: {
      type: "object",
      properties: {
        genre: { type: "string", description: "Music genre" },
        mood: { type: "string", description: "Emotional mood" },
        theme: { type: "string", description: "Song theme" },
        instruments: {
          type: "string",
          description: "Preferred instruments"
        }
      }
    }
  },
  {
    name: "prepare_vocal_prompt",
    description:
      "Prepare a detailed vocal music prompt for a music creation tool.",
    inputSchema: {
      type: "object",
      properties: {
        lyrics: { type: "string", description: "Lyrics, if available" },
        genre: { type: "string", description: "Music genre" },
        mood: { type: "string", description: "Song mood" },
        vocalStyle: {
          type: "string",
          description: "Desired vocal style"
        },
        language: {
          type: "string",
          description: "Language of the song"
        }
      }
    }
  }
];

function reply(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
      "Access-Control-Allow-Headers":
        "Content-Type, Accept, Mcp-Session-Id, Mcp-Protocol-Version, Authorization",
      "Access-Control-Expose-Headers":
        "Mcp-Session-Id, Mcp-Protocol-Version"
    }
  });
}

function rpcResult(id, result) {
  return { jsonrpc: "2.0", id, result };
}

function rpcError(id, code, message) {
  return {
    jsonrpc: "2.0",
    id: id ?? null,
    error: { code, message }
  };
}

function textResult(text) {
  return { content: [{ type: "text", text }] };
}

function getText(value, fallback = "") {
  return typeof value === "string" && value.trim()
    ? value.trim()
    : fallback;
}

function runTool(name, args = {}) {
  if (name === "generate_music_idea") {
    const genre = getText(args.genre, "pop");
    const mood = getText(args.mood, "emotional and uplifting");
    const theme = getText(args.theme, "hope and new beginnings");
    const instruments = getText(
      args.instruments,
      "piano, warm strings, and gentle percussion"
    );

    return textResult(
      `Music idea:\n` +
      `Genre: ${genre}\n` +
      `Mood: ${mood}\n` +
      `Theme: ${theme}\n` +
      `Instruments: ${instruments}\n\n` +
      `Arrangement: Begin with a simple melodic introduction, ` +
      `build gradually into a memorable chorus, and finish with ` +
      `a gentle, satisfying ending.\n` +
      `Suggested tempo: 90–110 BPM. ` +
      `Adjust the tempo to suit the requested mood.`
    );
  }

  if (name === "prepare_vocal_prompt") {
    const genre = getText(args.genre, "cinematic pop");
    const mood = getText(args.mood, "emotional and expressive");
    const vocalStyle = getText(
      args.vocalStyle,
      "clear, expressive lead vocals"
    );
    const language = getText(args.language, "Persian");
    const lyrics = getText(args.lyrics, "[Insert lyrics here]");

    return textResult(
      `VOCAL MUSIC PROMPT\n\n` +
      `Create a ${genre} song with a ${mood} atmosphere. ` +
      `Use ${vocalStyle}. The song language is ${language}. ` +
      `Keep the melody memorable, the vocals clear, and the ` +
      `arrangement balanced. Build emotion gradually toward ` +
      `the chorus, with a polished and natural-sounding mix.\n\n` +
      `LYRICS:\n${lyrics}\n\n` +
      `Note: This is a prompt for a compatible music-generation ` +
      `service; this MCP tool does not generate an audio file.`
    );
  }

  throw new Error("Unknown tool: " + name);
}

async function handleRpc(message) {
  if (!message || message.jsonrpc !== "2.0") {
    return rpcError(message?.id, -32600, "Invalid JSON-RPC request");
  }

  const { id, method, params = {} } = message;

  // Notifications do not receive JSON-RPC responses.
  if (typeof id === "undefined") return null;

  if (method === "initialize") {
    return rpcResult(id, {
      protocolVersion: "2025-03-26",
      capabilities: { tools: {} },
      serverInfo: SERVER_INFO,
      instructions:
        "Use the music tools to create ideas and prepare vocal prompts."
    });
  }

  if (method === "ping") {
    return rpcResult(id, {});
  }

  if (method === "tools/list") {
    return rpcResult(id, { tools: TOOLS });
  }

  if (method === "tools/call") {
    const name = params.name;
    const args = params.arguments || {};

    if (!TOOLS.some((tool) => tool.name === name)) {
      return rpcResult(id, {
        ...textResult("Unknown tool: " + String(name)),
        isError: true
      });
    }

    try {
      return rpcResult(id, runTool(name, args));
    } catch (error) {
      return rpcResult(id, {
        ...textResult(error.message || "Tool execution failed"),
        isError: true
      });
    }
  }

  return rpcError(id, -32601, "Method not found: " + method);
}

export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
          "Access-Control-Allow-Headers":
            "Content-Type, Accept, Mcp-Session-Id, Mcp-Protocol-Version, Authorization"
        }
      });
    }

    if (url.pathname !== "/mcp") {
      return reply({
        name: SERVER_INFO.name,
        status: "ok",
        endpoint: "/mcp"
      });
    }

    if (request.method === "GET") {
      return new Response("Use POST for MCP requests.", {
        status: 405,
        headers: { "Access-Control-Allow-Origin": "*" }
      });
    }

    if (request.method !== "POST") {
      return reply({ error: "Method not allowed" }, 405);
    }

    let message;

    try {
      message = await request.json();
    } catch {
      return reply(
        rpcError(null, -32700, "Parse error"),
        400
      );
    }

    if (Array.isArray(message)) {
      return reply(
        rpcError(null, -32600, "Batch requests are not supported"),
        400
      );
    }

    // MCP initialization notifications and other notifications
    // must be acknowledged with HTTP 202 and no JSON body.
    if (
      message &&
      message.jsonrpc === "2.0" &&
      typeof message.method === "string" &&
      !("id" in message)
    ) {
      return new Response(null, {
        status: 202,
        headers: { "Access-Control-Allow-Origin": "*" }
      });
    }

    return reply(await handleRpc(message));
  }
};
