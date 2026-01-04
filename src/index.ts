import express, { Request, Response } from "express";
import { randomUUID } from "crypto";

const app = express();

// Configuration from environment
const TRELLO_API_KEY = process.env.TRELLO_API_KEY || "";
const TRELLO_TOKEN = process.env.TRELLO_TOKEN || "";
const PORT = process.env.PORT || 3000;

const BASE_URL = "https://api.trello.com/1";

// Session management for SSE
const sessions = new Map<string, Response>();

// Helper function for API requests
async function trelloRequest(
  endpoint: string,
  method: string = "GET",
  body?: any
): Promise<any> {
  const separator = endpoint.includes("?") ? "&" : "?";
  const url = `${BASE_URL}${endpoint}${separator}key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}`;

  const options: RequestInit = {
    method,
    headers: { "Content-Type": "application/json" },
  };

  if (body && (method === "POST" || method === "PUT")) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Trello API error ${response.status}: ${errorText}`);
  }

  return response.json();
}

// Tool definitions
const tools = [
  // Board tools
  {
    name: "list_boards",
    description: "List all boards for the authenticated user",
    inputSchema: {
      type: "object",
      properties: {
        filter: { type: "string", description: "Filter: all, open, closed, members, organization, public, starred" },
      },
    },
  },
  {
    name: "get_board",
    description: "Get details of a specific board",
    inputSchema: {
      type: "object",
      properties: {
        boardId: { type: "string", description: "The ID of the board" },
      },
      required: ["boardId"],
    },
  },
  {
    name: "create_board",
    description: "Create a new Trello board",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Name for the new board" },
        desc: { type: "string", description: "Description for the board" },
        defaultLists: { type: "boolean", description: "Create default lists (To Do, Doing, Done)" },
      },
      required: ["name"],
    },
  },
  // List tools
  {
    name: "get_lists",
    description: "Get all lists on a board",
    inputSchema: {
      type: "object",
      properties: {
        boardId: { type: "string", description: "The ID of the board" },
        filter: { type: "string", description: "Filter: all, open, closed" },
      },
      required: ["boardId"],
    },
  },
  {
    name: "create_list",
    description: "Create a new list on a board",
    inputSchema: {
      type: "object",
      properties: {
        boardId: { type: "string", description: "The ID of the board" },
        name: { type: "string", description: "Name for the new list" },
        pos: { type: "string", description: "Position: top, bottom, or a positive number" },
      },
      required: ["boardId", "name"],
    },
  },
  {
    name: "archive_list",
    description: "Archive (close) a list",
    inputSchema: {
      type: "object",
      properties: {
        listId: { type: "string", description: "The ID of the list" },
      },
      required: ["listId"],
    },
  },
  // Card tools
  {
    name: "get_cards",
    description: "Get all cards on a board or list",
    inputSchema: {
      type: "object",
      properties: {
        boardId: { type: "string", description: "The ID of the board (use this OR listId)" },
        listId: { type: "string", description: "The ID of the list (use this OR boardId)" },
        filter: { type: "string", description: "Filter: all, open, closed" },
      },
    },
  },
  {
    name: "get_card",
    description: "Get details of a specific card",
    inputSchema: {
      type: "object",
      properties: {
        cardId: { type: "string", description: "The ID of the card" },
      },
      required: ["cardId"],
    },
  },
  {
    name: "create_card",
    description: "Create a new card in a list",
    inputSchema: {
      type: "object",
      properties: {
        listId: { type: "string", description: "The ID of the list to add the card to" },
        name: { type: "string", description: "Name/title of the card" },
        desc: { type: "string", description: "Description of the card" },
        pos: { type: "string", description: "Position: top, bottom, or a positive number" },
        due: { type: "string", description: "Due date (ISO format)" },
        idLabels: { type: "string", description: "Comma-separated list of label IDs" },
        idMembers: { type: "string", description: "Comma-separated list of member IDs" },
      },
      required: ["listId", "name"],
    },
  },
  {
    name: "update_card",
    description: "Update an existing card",
    inputSchema: {
      type: "object",
      properties: {
        cardId: { type: "string", description: "The ID of the card" },
        name: { type: "string", description: "New name for the card" },
        desc: { type: "string", description: "New description" },
        closed: { type: "boolean", description: "Archive the card" },
        idList: { type: "string", description: "Move to a different list" },
        due: { type: "string", description: "Due date (ISO format)" },
        dueComplete: { type: "boolean", description: "Mark due date as complete" },
      },
      required: ["cardId"],
    },
  },
  {
    name: "move_card",
    description: "Move a card to a different list",
    inputSchema: {
      type: "object",
      properties: {
        cardId: { type: "string", description: "The ID of the card" },
        listId: { type: "string", description: "The ID of the destination list" },
        pos: { type: "string", description: "Position: top, bottom, or a positive number" },
      },
      required: ["cardId", "listId"],
    },
  },
  {
    name: "delete_card",
    description: "Delete a card permanently",
    inputSchema: {
      type: "object",
      properties: {
        cardId: { type: "string", description: "The ID of the card to delete" },
      },
      required: ["cardId"],
    },
  },
  {
    name: "add_comment",
    description: "Add a comment to a card",
    inputSchema: {
      type: "object",
      properties: {
        cardId: { type: "string", description: "The ID of the card" },
        text: { type: "string", description: "The comment text" },
      },
      required: ["cardId", "text"],
    },
  },
  // Label tools
  {
    name: "get_labels",
    description: "Get all labels on a board",
    inputSchema: {
      type: "object",
      properties: {
        boardId: { type: "string", description: "The ID of the board" },
      },
      required: ["boardId"],
    },
  },
  {
    name: "create_label",
    description: "Create a new label on a board",
    inputSchema: {
      type: "object",
      properties: {
        boardId: { type: "string", description: "The ID of the board" },
        name: { type: "string", description: "Name for the label" },
        color: { type: "string", description: "Color: yellow, purple, blue, red, green, orange, black, sky, pink, lime" },
      },
      required: ["boardId", "name", "color"],
    },
  },
  {
    name: "add_label_to_card",
    description: "Add a label to a card",
    inputSchema: {
      type: "object",
      properties: {
        cardId: { type: "string", description: "The ID of the card" },
        labelId: { type: "string", description: "The ID of the label" },
      },
      required: ["cardId", "labelId"],
    },
  },
  // Member tools
  {
    name: "get_board_members",
    description: "Get all members of a board",
    inputSchema: {
      type: "object",
      properties: {
        boardId: { type: "string", description: "The ID of the board" },
      },
      required: ["boardId"],
    },
  },
  {
    name: "add_member_to_card",
    description: "Add a member to a card",
    inputSchema: {
      type: "object",
      properties: {
        cardId: { type: "string", description: "The ID of the card" },
        memberId: { type: "string", description: "The ID of the member" },
      },
      required: ["cardId", "memberId"],
    },
  },
  // Checklist tools
  {
    name: "get_checklists",
    description: "Get all checklists on a card",
    inputSchema: {
      type: "object",
      properties: {
        cardId: { type: "string", description: "The ID of the card" },
      },
      required: ["cardId"],
    },
  },
  {
    name: "create_checklist",
    description: "Create a new checklist on a card",
    inputSchema: {
      type: "object",
      properties: {
        cardId: { type: "string", description: "The ID of the card" },
        name: { type: "string", description: "Name for the checklist" },
      },
      required: ["cardId", "name"],
    },
  },
  {
    name: "add_checklist_item",
    description: "Add an item to a checklist",
    inputSchema: {
      type: "object",
      properties: {
        checklistId: { type: "string", description: "The ID of the checklist" },
        name: { type: "string", description: "Name of the checklist item" },
        checked: { type: "boolean", description: "Whether the item is checked" },
      },
      required: ["checklistId", "name"],
    },
  },
  // Search
  {
    name: "search",
    description: "Search for boards, cards, members, or organizations",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query" },
        modelTypes: { type: "string", description: "Comma-separated: actions, boards, cards, members, organizations" },
        limit: { type: "number", description: "Max results per type (default: 10)" },
      },
      required: ["query"],
    },
  },
];

// Tool execution
async function executeTool(name: string, args: any): Promise<any> {
  switch (name) {
    // Board tools
    case "list_boards": {
      const filter = args.filter || "all";
      return await trelloRequest(`/members/me/boards?filter=${filter}`);
    }
    case "get_board": {
      return await trelloRequest(`/boards/${args.boardId}`);
    }
    case "create_board": {
      const params = new URLSearchParams({ name: args.name });
      if (args.desc) params.append("desc", args.desc);
      if (args.defaultLists !== undefined) params.append("defaultLists", String(args.defaultLists));
      return await trelloRequest(`/boards?${params.toString()}`, "POST");
    }

    // List tools
    case "get_lists": {
      const filter = args.filter || "all";
      return await trelloRequest(`/boards/${args.boardId}/lists?filter=${filter}`);
    }
    case "create_list": {
      const params = new URLSearchParams({ name: args.name, idBoard: args.boardId });
      if (args.pos) params.append("pos", args.pos);
      return await trelloRequest(`/lists?${params.toString()}`, "POST");
    }
    case "archive_list": {
      return await trelloRequest(`/lists/${args.listId}/closed?value=true`, "PUT");
    }

    // Card tools
    case "get_cards": {
      if (args.listId) {
        return await trelloRequest(`/lists/${args.listId}/cards`);
      }
      const filter = args.filter || "all";
      return await trelloRequest(`/boards/${args.boardId}/cards?filter=${filter}`);
    }
    case "get_card": {
      return await trelloRequest(`/cards/${args.cardId}`);
    }
    case "create_card": {
      const params = new URLSearchParams({ idList: args.listId, name: args.name });
      if (args.desc) params.append("desc", args.desc);
      if (args.pos) params.append("pos", args.pos);
      if (args.due) params.append("due", args.due);
      if (args.idLabels) params.append("idLabels", args.idLabels);
      if (args.idMembers) params.append("idMembers", args.idMembers);
      return await trelloRequest(`/cards?${params.toString()}`, "POST");
    }
    case "update_card": {
      const params = new URLSearchParams();
      if (args.name) params.append("name", args.name);
      if (args.desc) params.append("desc", args.desc);
      if (args.closed !== undefined) params.append("closed", String(args.closed));
      if (args.idList) params.append("idList", args.idList);
      if (args.due) params.append("due", args.due);
      if (args.dueComplete !== undefined) params.append("dueComplete", String(args.dueComplete));
      return await trelloRequest(`/cards/${args.cardId}?${params.toString()}`, "PUT");
    }
    case "move_card": {
      const params = new URLSearchParams({ idList: args.listId });
      if (args.pos) params.append("pos", args.pos);
      return await trelloRequest(`/cards/${args.cardId}?${params.toString()}`, "PUT");
    }
    case "delete_card": {
      return await trelloRequest(`/cards/${args.cardId}`, "DELETE");
    }
    case "add_comment": {
      return await trelloRequest(`/cards/${args.cardId}/actions/comments?text=${encodeURIComponent(args.text)}`, "POST");
    }

    // Label tools
    case "get_labels": {
      return await trelloRequest(`/boards/${args.boardId}/labels`);
    }
    case "create_label": {
      const params = new URLSearchParams({ name: args.name, color: args.color, idBoard: args.boardId });
      return await trelloRequest(`/labels?${params.toString()}`, "POST");
    }
    case "add_label_to_card": {
      return await trelloRequest(`/cards/${args.cardId}/idLabels?value=${args.labelId}`, "POST");
    }

    // Member tools
    case "get_board_members": {
      return await trelloRequest(`/boards/${args.boardId}/members`);
    }
    case "add_member_to_card": {
      return await trelloRequest(`/cards/${args.cardId}/idMembers?value=${args.memberId}`, "POST");
    }

    // Checklist tools
    case "get_checklists": {
      return await trelloRequest(`/cards/${args.cardId}/checklists`);
    }
    case "create_checklist": {
      return await trelloRequest(`/cards/${args.cardId}/checklists?name=${encodeURIComponent(args.name)}`, "POST");
    }
    case "add_checklist_item": {
      const params = new URLSearchParams({ name: args.name });
      if (args.checked !== undefined) params.append("checked", String(args.checked));
      return await trelloRequest(`/checklists/${args.checklistId}/checkItems?${params.toString()}`, "POST");
    }

    // Search
    case "search": {
      const params = new URLSearchParams({ query: args.query });
      if (args.modelTypes) params.append("modelTypes", args.modelTypes);
      params.append("cards_limit", String(args.limit || 10));
      params.append("boards_limit", String(args.limit || 10));
      return await trelloRequest(`/search?${params.toString()}`);
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// Handle MCP JSON-RPC request
async function handleMcpRequest(request: any): Promise<any> {
  const { jsonrpc, id, method, params } = request;

  try {
    let result;

    switch (method) {
      case "initialize":
        result = {
          protocolVersion: "2024-11-05",
          serverInfo: { name: "trello-mcp-server", version: "1.0.0" },
          capabilities: { tools: {} },
        };
        break;
      case "notifications/initialized":
        return null;
      case "tools/list":
        result = { tools };
        break;
      case "tools/call":
        const toolResult = await executeTool(params.name, params.arguments || {});
        result = { content: [{ type: "text", text: JSON.stringify(toolResult, null, 2) }] };
        break;
      case "ping":
        result = {};
        break;
      default:
        throw new Error(`Unknown method: ${method}`);
    }

    if (id !== undefined) {
      return { jsonrpc: "2.0", id, result };
    }
    return null;
  } catch (error) {
    if (id !== undefined) {
      return {
        jsonrpc: "2.0",
        id,
        error: { code: -32603, message: error instanceof Error ? error.message : String(error) },
      };
    }
    return null;
  }
}

// SSE endpoint
app.get("/sse", (req: Request, res: Response) => {
  const sessionId = randomUUID();

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", "*");

  sessions.set(sessionId, res);
  res.write(`event: endpoint\ndata: /messages?sessionId=${sessionId}\n\n`);

  const keepAlive = setInterval(() => {
    res.write(": keepalive\n\n");
  }, 30000);

  req.on("close", () => {
    clearInterval(keepAlive);
    sessions.delete(sessionId);
  });
});

// Messages endpoint
app.post("/messages", async (req: Request, res: Response) => {
  const sessionId = req.query.sessionId as string;

  if (!sessionId || !sessions.has(sessionId)) {
    res.status(400).json({ error: "Invalid or missing sessionId" });
    return;
  }

  const sseResponse = sessions.get(sessionId)!;

  let body = "";
  req.setEncoding("utf8");

  for await (const chunk of req) {
    body += chunk;
  }

  try {
    const request = JSON.parse(body);
    const response = await handleMcpRequest(request);

    if (response) {
      sseResponse.write(`event: message\ndata: ${JSON.stringify(response)}\n\n`);
    }

    res.status(202).json({ status: "accepted" });
  } catch (error) {
    console.error("Error handling message:", error);
    res.status(400).json({ error: "Invalid request" });
  }
});

// Health check
app.get("/health", (req: Request, res: Response) => {
  res.json({ status: "ok", sessions: sessions.size, version: "1.0.0" });
});

// Root endpoint
app.get("/", (req: Request, res: Response) => {
  res.json({
    name: "Trello MCP Server",
    version: "1.0.0",
    endpoints: { sse: "/sse", messages: "/messages", health: "/health" },
    tools: tools.map((t) => t.name),
  });
});

app.listen(PORT, () => {
  console.log(`Trello MCP Server v1.0.0 running on port ${PORT}`);
});
