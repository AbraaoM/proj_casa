import { handleMcpPost, mcpMethodNotAllowed } from "@/lib/mcp/server";

/** Remote MCP (Streamable HTTP, stateless). Guide: docs/agente-conectar.md. */
export async function POST(request: Request) {
  return handleMcpPost(request);
}

export async function GET() {
  return mcpMethodNotAllowed();
}

export async function DELETE() {
  return mcpMethodNotAllowed();
}
