// Conversational agent for the Chat tab. Runs a manual tool-use loop against
// the Claude API (Messages endpoint) and executes tool calls against the Lead
// Assist system API. Everything here runs in the background service worker, so
// the extension's host_permissions (not page CORS) govern the network calls.

import { getSettings, createUser, createClientStatus } from "./api-client.js";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const MAX_TOOL_ROUNDS = 8;

const SYSTEM_PROMPT = `You are the Lead Assist assistant, embedded in a Chrome extension used by an internal team. You help teammates get things done in the Lead Assist system by calling its API through the tools provided.

You can currently:
- Create users (create_user)
- Create client statuses such as "New", "Reapply", or "Qualified" for a specific client (create_client_status)

Guidelines:
- Only "name" and "email" are strictly required to create a user; "client_id" and "name" are required to create a client status. If a required field is missing, ask a brief, specific question instead of guessing.
- For non-required fields, use sensible defaults or leave them out rather than interrogating the user.
- When a request is clear and has the required fields, go ahead and call the tool — don't ask for confirmation on routine creates.
- After a tool runs, report the outcome plainly, including any id the API returned. If a tool returns an error, explain what failed and what the user could try.
- If asked to do something the tools don't support yet, say so briefly rather than pretending.
Keep replies short and action-oriented.`;

const TOOLS = [
  {
    name: "create_user",
    description:
      "Create a new Lead Assist user. Use when the user asks to add or create a user. 'name' and 'email' are required.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Full name" },
        email: { type: "string", description: "Email address (unique per user)" },
        phone: { type: "string", description: "Phone number, e.g. +16155550123" },
        password: { type: "string", description: "Initial password" },
        role: { type: "string", description: "Role, e.g. admin or agent" },
        show_vhe: { type: "boolean" },
        show_user: { type: "boolean" },
      },
      required: ["name", "email"],
    },
  },
  {
    name: "create_client_status",
    description:
      "Create a status (e.g. New, Reapply, Qualified) for a specific client. Use when the user asks to add a client status. 'client_id' and 'name' are required.",
    input_schema: {
      type: "object",
      properties: {
        client_id: { type: "integer", description: "The client's numeric ID" },
        name: { type: "string", description: "Status name, e.g. New" },
        priority: { type: "integer" },
        active: { type: "boolean" },
        not_qualified: { type: "boolean" },
        allow_scheduled_calls: { type: "boolean" },
      },
      required: ["client_id", "name"],
    },
  },
];

async function executeTool(name, input) {
  if (name === "create_user") {
    return createUser(input);
  }
  if (name === "create_client_status") {
    const { client_id, ...status } = input;
    return createClientStatus(client_id, status);
  }
  throw new Error(`Unknown tool: ${name}`);
}

async function callClaude({ apiKey, model, messages }) {
  const response = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
      // Allow the request from the extension's origin.
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      tools: TOOLS,
      messages,
    }),
  });

  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  if (!response.ok) {
    const detail =
      typeof data === "string" ? data : JSON.stringify(data?.error || data);
    throw new Error(`Claude API ${response.status}: ${detail}`);
  }
  return data;
}

function textFrom(content) {
  return (Array.isArray(content) ? content : [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
}

// `messages` is the full Anthropic-format conversation from the side panel.
// Returns the updated conversation (including tool interactions) plus the final
// assistant text, so the panel can persist history and render the reply.
export async function runChat(messages) {
  const { anthropicApiKey, chatModel } = await getSettings();
  if (!anthropicApiKey) {
    throw new Error(
      "No Anthropic API key configured. Add anthropicApiKey to config.local.json, or set it on the Settings page, then reload the extension."
    );
  }

  const working = [...messages];
  let reply = "";

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await callClaude({
      apiKey: anthropicApiKey,
      model: chatModel,
      messages: working,
    });

    working.push({ role: "assistant", content: response.content });

    if (response.stop_reason !== "tool_use") {
      reply = textFrom(response.content);
      break;
    }

    const toolResults = [];
    for (const block of response.content) {
      if (block.type !== "tool_use") continue;
      try {
        const result = await executeTool(block.name, block.input);
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: JSON.stringify(result),
        });
      } catch (err) {
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: `Error: ${err.message || String(err)}`,
          is_error: true,
        });
      }
    }
    working.push({ role: "user", content: toolResults });
  }

  if (!reply) {
    reply = "I wasn't able to finish that — please try rephrasing.";
  }
  return { messages: working, text: reply };
}
