import express, { Request, Response } from "express";
import { randomUUID } from "crypto";

const app = express();
const TRELLO_API_KEY = process.env.TRELLO_API_KEY || "";
const TRELLO_TOKEN = process.env.TRELLO_TOKEN || "";
const PORT = process.env.PORT || 3000;
const BASE_URL = "https://api.trello.com/1";

const sessions = new Map<string, Response>();

async function trelloRequest(method: string, endpoint: string, body?: any, queryParams?: any): Promise<any> {
  const url = new URL(`${BASE_URL}${endpoint}`);
  url.searchParams.set("key", TRELLO_API_KEY);
  url.searchParams.set("token", TRELLO_TOKEN);
  if (queryParams) Object.entries(queryParams).forEach(([k, v]) => v != null && url.searchParams.set(k, String(v)));
  const opts: RequestInit = { method, headers: { "Content-Type": "application/json" } };
  if (body && (method === "POST" || method === "PUT")) opts.body = JSON.stringify(body);
  const res = await fetch(url.toString(), opts);
  if (!res.ok) throw new Error(`Trello API error ${res.status}: ${await res.text()}`);
  const text = await res.text();
  return text ? JSON.parse(text) : {};
}

const tools = [
  // BOARDS
  { name: "list_boards", description: "List all boards", inputSchema: { type: "object", properties: { filter: { type: "string", enum: ["all", "closed", "members", "open", "organization", "public", "starred"] }, fields: { type: "string" } } } },
  { name: "get_board", description: "Get board details", inputSchema: { type: "object", properties: { boardId: { type: "string" }, fields: { type: "string" }, lists: { type: "string" }, cards: { type: "string" }, members: { type: "string" }, labels: { type: "string" } }, required: ["boardId"] } },
  { name: "create_board", description: "Create board", inputSchema: { type: "object", properties: { name: { type: "string" }, desc: { type: "string" }, defaultLists: { type: "boolean" }, idOrganization: { type: "string" }, prefs_permissionLevel: { type: "string" } }, required: ["name"] } },
  { name: "update_board", description: "Update board", inputSchema: { type: "object", properties: { boardId: { type: "string" }, name: { type: "string" }, desc: { type: "string" }, closed: { type: "boolean" } }, required: ["boardId"] } },
  { name: "delete_board", description: "Delete board", inputSchema: { type: "object", properties: { boardId: { type: "string" } }, required: ["boardId"] } },
  // LISTS
  { name: "get_lists", description: "Get lists on board", inputSchema: { type: "object", properties: { boardId: { type: "string" }, filter: { type: "string" }, cards: { type: "string" } }, required: ["boardId"] } },
  { name: "create_list", description: "Create list", inputSchema: { type: "object", properties: { name: { type: "string" }, idBoard: { type: "string" }, pos: { type: "string" } }, required: ["name", "idBoard"] } },
  { name: "update_list", description: "Update list", inputSchema: { type: "object", properties: { listId: { type: "string" }, name: { type: "string" }, closed: { type: "boolean" }, pos: { type: "string" } }, required: ["listId"] } },
  { name: "archive_list", description: "Archive/unarchive list", inputSchema: { type: "object", properties: { listId: { type: "string" }, value: { type: "boolean" } }, required: ["listId", "value"] } },
  { name: "move_list_to_board", description: "Move list to board", inputSchema: { type: "object", properties: { listId: { type: "string" }, boardId: { type: "string" } }, required: ["listId", "boardId"] } },
  // CARDS
  { name: "get_cards", description: "Get cards", inputSchema: { type: "object", properties: { boardId: { type: "string" }, listId: { type: "string" }, filter: { type: "string" }, fields: { type: "string" }, attachments: { type: "boolean" }, members: { type: "boolean" }, checklists: { type: "string" } } } },
  { name: "get_card", description: "Get card details", inputSchema: { type: "object", properties: { cardId: { type: "string" }, fields: { type: "string" }, attachments: { type: "boolean" }, members: { type: "boolean" }, checklists: { type: "string" }, actions: { type: "string" } }, required: ["cardId"] } },
  { name: "create_card", description: "Create card", inputSchema: { type: "object", properties: { name: { type: "string" }, idList: { type: "string" }, desc: { type: "string" }, pos: { type: "string" }, due: { type: "string" }, start: { type: "string" }, dueComplete: { type: "boolean" }, idMembers: { type: "string" }, idLabels: { type: "string" }, urlSource: { type: "string" } }, required: ["name", "idList"] } },
  { name: "update_card", description: "Update card", inputSchema: { type: "object", properties: { cardId: { type: "string" }, name: { type: "string" }, desc: { type: "string" }, closed: { type: "boolean" }, due: { type: "string" }, start: { type: "string" }, dueComplete: { type: "boolean" }, idList: { type: "string" }, pos: { type: "string" }, idMembers: { type: "string" }, idLabels: { type: "string" } }, required: ["cardId"] } },
  { name: "move_card", description: "Move card", inputSchema: { type: "object", properties: { cardId: { type: "string" }, idList: { type: "string" }, idBoard: { type: "string" }, pos: { type: "string" } }, required: ["cardId", "idList"] } },
  { name: "delete_card", description: "Delete card", inputSchema: { type: "object", properties: { cardId: { type: "string" } }, required: ["cardId"] } },
  { name: "add_comment", description: "Add comment to card", inputSchema: { type: "object", properties: { cardId: { type: "string" }, text: { type: "string" } }, required: ["cardId", "text"] } },
  { name: "update_comment", description: "Update comment", inputSchema: { type: "object", properties: { cardId: { type: "string" }, actionId: { type: "string" }, text: { type: "string" } }, required: ["cardId", "actionId", "text"] } },
  { name: "delete_comment", description: "Delete comment", inputSchema: { type: "object", properties: { cardId: { type: "string" }, actionId: { type: "string" } }, required: ["cardId", "actionId"] } },
  // LABELS
  { name: "get_labels", description: "Get board labels", inputSchema: { type: "object", properties: { boardId: { type: "string" } }, required: ["boardId"] } },
  { name: "create_label", description: "Create label", inputSchema: { type: "object", properties: { name: { type: "string" }, color: { type: "string" }, idBoard: { type: "string" } }, required: ["idBoard", "color"] } },
  { name: "update_label", description: "Update label", inputSchema: { type: "object", properties: { labelId: { type: "string" }, name: { type: "string" }, color: { type: "string" } }, required: ["labelId"] } },
  { name: "delete_label", description: "Delete label", inputSchema: { type: "object", properties: { labelId: { type: "string" } }, required: ["labelId"] } },
  { name: "add_label_to_card", description: "Add label to card", inputSchema: { type: "object", properties: { cardId: { type: "string" }, labelId: { type: "string" } }, required: ["cardId", "labelId"] } },
  { name: "remove_label_from_card", description: "Remove label from card", inputSchema: { type: "object", properties: { cardId: { type: "string" }, labelId: { type: "string" } }, required: ["cardId", "labelId"] } },
  // MEMBERS
  { name: "get_board_members", description: "Get board members", inputSchema: { type: "object", properties: { boardId: { type: "string" }, filter: { type: "string" } }, required: ["boardId"] } },
  { name: "add_member_to_card", description: "Add member to card", inputSchema: { type: "object", properties: { cardId: { type: "string" }, memberId: { type: "string" } }, required: ["cardId", "memberId"] } },
  { name: "remove_member_from_card", description: "Remove member from card", inputSchema: { type: "object", properties: { cardId: { type: "string" }, memberId: { type: "string" } }, required: ["cardId", "memberId"] } },
  { name: "get_member", description: "Get member info", inputSchema: { type: "object", properties: { memberId: { type: "string" }, fields: { type: "string" } }, required: ["memberId"] } },
  // CHECKLISTS
  { name: "get_checklists", description: "Get checklists", inputSchema: { type: "object", properties: { cardId: { type: "string" }, boardId: { type: "string" }, fields: { type: "string" } } } },
  { name: "create_checklist", description: "Create checklist", inputSchema: { type: "object", properties: { idCard: { type: "string" }, name: { type: "string" }, pos: { type: "string" }, idChecklistSource: { type: "string" } }, required: ["idCard", "name"] } },
  { name: "delete_checklist", description: "Delete checklist", inputSchema: { type: "object", properties: { checklistId: { type: "string" } }, required: ["checklistId"] } },
  { name: "add_checklist_item", description: "Add checklist item", inputSchema: { type: "object", properties: { checklistId: { type: "string" }, name: { type: "string" }, pos: { type: "string" }, checked: { type: "boolean" }, due: { type: "string" }, idMember: { type: "string" } }, required: ["checklistId", "name"] } },
  { name: "update_checklist_item", description: "Update checklist item", inputSchema: { type: "object", properties: { cardId: { type: "string" }, checkItemId: { type: "string" }, state: { type: "string" }, name: { type: "string" }, pos: { type: "string" }, due: { type: "string" }, idMember: { type: "string" } }, required: ["cardId", "checkItemId"] } },
  { name: "delete_checklist_item", description: "Delete checklist item", inputSchema: { type: "object", properties: { cardId: { type: "string" }, checkItemId: { type: "string" } }, required: ["cardId", "checkItemId"] } },
  // ATTACHMENTS
  { name: "get_attachments", description: "Get card attachments", inputSchema: { type: "object", properties: { cardId: { type: "string" } }, required: ["cardId"] } },
  { name: "add_attachment", description: "Add attachment via URL", inputSchema: { type: "object", properties: { cardId: { type: "string" }, url: { type: "string" }, name: { type: "string" }, setCover: { type: "boolean" } }, required: ["cardId", "url"] } },
  { name: "delete_attachment", description: "Delete attachment", inputSchema: { type: "object", properties: { cardId: { type: "string" }, attachmentId: { type: "string" } }, required: ["cardId", "attachmentId"] } },
  // CUSTOM FIELDS
  { name: "get_custom_fields", description: "Get board custom fields", inputSchema: { type: "object", properties: { boardId: { type: "string" } }, required: ["boardId"] } },
  { name: "get_card_custom_fields", description: "Get card custom field values", inputSchema: { type: "object", properties: { cardId: { type: "string" } }, required: ["cardId"] } },
  { name: "update_card_custom_field", description: "Set custom field value", inputSchema: { type: "object", properties: { cardId: { type: "string" }, customFieldId: { type: "string" }, value: { type: "object" } }, required: ["cardId", "customFieldId", "value"] } },
  // WEBHOOKS
  { name: "create_webhook", description: "Create webhook", inputSchema: { type: "object", properties: { callbackURL: { type: "string" }, idModel: { type: "string" }, description: { type: "string" }, active: { type: "boolean" } }, required: ["callbackURL", "idModel"] } },
  { name: "get_webhooks", description: "Get webhooks", inputSchema: { type: "object", properties: {} } },
  { name: "delete_webhook", description: "Delete webhook", inputSchema: { type: "object", properties: { webhookId: { type: "string" } }, required: ["webhookId"] } },
  // ACTIONS
  { name: "get_card_actions", description: "Get card activity", inputSchema: { type: "object", properties: { cardId: { type: "string" }, filter: { type: "string" }, limit: { type: "number" } }, required: ["cardId"] } },
  { name: "get_board_actions", description: "Get board activity", inputSchema: { type: "object", properties: { boardId: { type: "string" }, filter: { type: "string" }, limit: { type: "number" } }, required: ["boardId"] } },
  // SEARCH
  { name: "search", description: "Search boards/cards/members", inputSchema: { type: "object", properties: { query: { type: "string" }, modelTypes: { type: "string" }, idBoards: { type: "string" }, cards_limit: { type: "number" }, boards_limit: { type: "number" }, partial: { type: "boolean" } }, required: ["query"] } },
  // ORGANIZATIONS
  { name: "get_organizations", description: "Get workspaces", inputSchema: { type: "object", properties: { fields: { type: "string" } } } },
];

async function executeTool(name: string, args: any): Promise<any> {
  switch (name) {
    case "list_boards": return trelloRequest("GET", "/members/me/boards", undefined, { filter: args.filter || "open", fields: args.fields || "name,desc,closed,url,prefs" });
    case "get_board": return trelloRequest("GET", `/boards/${args.boardId}`, undefined, { fields: args.fields, lists: args.lists, cards: args.cards, members: args.members, labels: args.labels });
    case "create_board": return trelloRequest("POST", "/boards", undefined, { name: args.name, desc: args.desc, defaultLists: args.defaultLists, idOrganization: args.idOrganization, prefs_permissionLevel: args.prefs_permissionLevel });
    case "update_board": return trelloRequest("PUT", `/boards/${args.boardId}`, undefined, { name: args.name, desc: args.desc, closed: args.closed });
    case "delete_board": return trelloRequest("DELETE", `/boards/${args.boardId}`);
    case "get_lists": return trelloRequest("GET", `/boards/${args.boardId}/lists`, undefined, { filter: args.filter || "open", cards: args.cards || "none" });
    case "create_list": return trelloRequest("POST", "/lists", undefined, { name: args.name, idBoard: args.idBoard, pos: args.pos });
    case "update_list": return trelloRequest("PUT", `/lists/${args.listId}`, undefined, { name: args.name, closed: args.closed, pos: args.pos });
    case "archive_list": return trelloRequest("PUT", `/lists/${args.listId}/closed`, undefined, { value: args.value });
    case "move_list_to_board": return trelloRequest("PUT", `/lists/${args.listId}/idBoard`, undefined, { value: args.boardId });
    case "get_cards": return trelloRequest("GET", args.listId ? `/lists/${args.listId}/cards` : `/boards/${args.boardId}/cards`, undefined, { filter: args.filter || "open", fields: args.fields, attachments: args.attachments, members: args.members, checklists: args.checklists });
    case "get_card": return trelloRequest("GET", `/cards/${args.cardId}`, undefined, { fields: args.fields, attachments: args.attachments, members: args.members, checklists: args.checklists, actions: args.actions });
    case "create_card": return trelloRequest("POST", "/cards", undefined, { name: args.name, idList: args.idList, desc: args.desc, pos: args.pos, due: args.due, start: args.start, dueComplete: args.dueComplete, idMembers: args.idMembers, idLabels: args.idLabels, urlSource: args.urlSource });
    case "update_card": return trelloRequest("PUT", `/cards/${args.cardId}`, undefined, { name: args.name, desc: args.desc, closed: args.closed, due: args.due, start: args.start, dueComplete: args.dueComplete, idList: args.idList, pos: args.pos, idMembers: args.idMembers, idLabels: args.idLabels });
    case "move_card": return trelloRequest("PUT", `/cards/${args.cardId}`, undefined, { idList: args.idList, idBoard: args.idBoard, pos: args.pos });
    case "delete_card": return trelloRequest("DELETE", `/cards/${args.cardId}`);
    case "add_comment": return trelloRequest("POST", `/cards/${args.cardId}/actions/comments`, undefined, { text: args.text });
    case "update_comment": return trelloRequest("PUT", `/cards/${args.cardId}/actions/${args.actionId}/comments`, undefined, { text: args.text });
    case "delete_comment": return trelloRequest("DELETE", `/cards/${args.cardId}/actions/${args.actionId}/comments`);
    case "get_labels": return trelloRequest("GET", `/boards/${args.boardId}/labels`);
    case "create_label": return trelloRequest("POST", "/labels", undefined, { name: args.name, color: args.color, idBoard: args.idBoard });
    case "update_label": return trelloRequest("PUT", `/labels/${args.labelId}`, undefined, { name: args.name, color: args.color });
    case "delete_label": return trelloRequest("DELETE", `/labels/${args.labelId}`);
    case "add_label_to_card": return trelloRequest("POST", `/cards/${args.cardId}/idLabels`, undefined, { value: args.labelId });
    case "remove_label_from_card": return trelloRequest("DELETE", `/cards/${args.cardId}/idLabels/${args.labelId}`);
    case "get_board_members": return trelloRequest("GET", `/boards/${args.boardId}/members`, undefined, { filter: args.filter || "all" });
    case "add_member_to_card": return trelloRequest("POST", `/cards/${args.cardId}/idMembers`, undefined, { value: args.memberId });
    case "remove_member_from_card": return trelloRequest("DELETE", `/cards/${args.cardId}/idMembers/${args.memberId}`);
    case "get_member": return trelloRequest("GET", `/members/${args.memberId}`, undefined, { fields: args.fields || "fullName,username,avatarUrl,email" });
    case "get_checklists": return trelloRequest("GET", args.cardId ? `/cards/${args.cardId}/checklists` : `/boards/${args.boardId}/checklists`, undefined, { fields: args.fields });
    case "create_checklist": return trelloRequest("POST", "/checklists", undefined, { idCard: args.idCard, name: args.name, pos: args.pos, idChecklistSource: args.idChecklistSource });
    case "delete_checklist": return trelloRequest("DELETE", `/checklists/${args.checklistId}`);
    case "add_checklist_item": return trelloRequest("POST", `/checklists/${args.checklistId}/checkItems`, undefined, { name: args.name, pos: args.pos, checked: args.checked, due: args.due, idMember: args.idMember });
    case "update_checklist_item": return trelloRequest("PUT", `/cards/${args.cardId}/checkItem/${args.checkItemId}`, undefined, { state: args.state, name: args.name, pos: args.pos, due: args.due, idMember: args.idMember });
    case "delete_checklist_item": return trelloRequest("DELETE", `/cards/${args.cardId}/checkItem/${args.checkItemId}`);
    case "get_attachments": return trelloRequest("GET", `/cards/${args.cardId}/attachments`);
    case "add_attachment": return trelloRequest("POST", `/cards/${args.cardId}/attachments`, undefined, { url: args.url, name: args.name, setCover: args.setCover });
    case "delete_attachment": return trelloRequest("DELETE", `/cards/${args.cardId}/attachments/${args.attachmentId}`);
    case "get_custom_fields": return trelloRequest("GET", `/boards/${args.boardId}/customFields`);
    case "get_card_custom_fields": return trelloRequest("GET", `/cards/${args.cardId}/customFieldItems`);
    case "update_card_custom_field": return trelloRequest("PUT", `/cards/${args.cardId}/customField/${args.customFieldId}/item`, { value: args.value });
    case "create_webhook": return trelloRequest("POST", "/webhooks", undefined, { callbackURL: args.callbackURL, idModel: args.idModel, description: args.description, active: args.active !== false });
    case "get_webhooks": return trelloRequest("GET", `/tokens/${TRELLO_TOKEN}/webhooks`);
    case "delete_webhook": return trelloRequest("DELETE", `/webhooks/${args.webhookId}`);
    case "get_card_actions": return trelloRequest("GET", `/cards/${args.cardId}/actions`, undefined, { filter: args.filter || "all", limit: args.limit || 50 });
    case "get_board_actions": return trelloRequest("GET", `/boards/${args.boardId}/actions`, undefined, { filter: args.filter || "all", limit: args.limit || 50 });
    case "search": return trelloRequest("GET", "/search", undefined, { query: args.query, modelTypes: args.modelTypes || "cards,boards", idBoards: args.idBoards, cards_limit: args.cards_limit || 10, boards_limit: args.boards_limit || 10, partial: args.partial });
    case "get_organizations": return trelloRequest("GET", "/members/me/organizations", undefined, { fields: args.fields || "displayName,name,desc,url" });
    default: throw new Error(`Unknown tool: ${name}`);
  }
}

async function handleMcpRequest(request: any): Promise<any> {
  const { id, method, params } = request;
  try {
    let result;
    switch (method) {
      case "initialize": result = { protocolVersion: "2024-11-05", serverInfo: { name: "trello-mcp-server", version: "2.0.0" }, capabilities: { tools: {} } }; break;
      case "notifications/initialized": return null;
      case "tools/list": result = { tools }; break;
      case "tools/call": result = { content: [{ type: "text", text: JSON.stringify(await executeTool(params.name, params.arguments || {}), null, 2) }] }; break;
      case "ping": result = {}; break;
      default: throw new Error(`Unknown method: ${method}`);
    }
    return id !== undefined ? { jsonrpc: "2.0", id, result } : null;
  } catch (error) {
    return id !== undefined ? { jsonrpc: "2.0", id, error: { code: -32603, message: error instanceof Error ? error.message : String(error) } } : null;
  }
}

app.get("/sse", (req, res) => {
  const sessionId = randomUUID();
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", "*");
  sessions.set(sessionId, res);
  res.write(`event: endpoint\ndata: /messages?sessionId=${sessionId}\n\n`);
  const keepAlive = setInterval(() => res.write(": keepalive\n\n"), 30000);
  req.on("close", () => { clearInterval(keepAlive); sessions.delete(sessionId); });
});

app.post("/messages", async (req, res) => {
  const sessionId = req.query.sessionId as string;
  if (!sessionId || !sessions.has(sessionId)) { res.status(400).json({ error: "Invalid sessionId" }); return; }
  const sseRes = sessions.get(sessionId)!;
  let body = ""; req.setEncoding("utf8"); for await (const chunk of req) body += chunk;
  try {
    const response = await handleMcpRequest(JSON.parse(body));
    if (response) sseRes.write(`event: message\ndata: ${JSON.stringify(response)}\n\n`);
    res.status(202).json({ status: "accepted" });
  } catch { res.status(400).json({ error: "Invalid request" }); }
});

app.get("/health", (_, res) => res.json({ status: "ok", sessions: sessions.size, version: "2.0.0", tools: tools.length }));
app.get("/", (_, res) => res.json({ name: "Trello MCP Server", version: "2.0.0", description: "Complete Trello API - 48 tools", endpoints: { sse: "/sse", messages: "/messages", health: "/health" }, toolCount: tools.length, categories: { boards: 5, lists: 5, cards: 9, labels: 6, members: 4, checklists: 6, attachments: 3, customFields: 3, webhooks: 3, actions: 2, search: 1, organizations: 1 }, tools: tools.map(t => ({ name: t.name, description: t.description })) }));

app.listen(PORT, () => console.log(`Trello MCP Server v2.0.0 on port ${PORT} - ${tools.length} tools`));
