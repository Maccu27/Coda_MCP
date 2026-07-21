#!/usr/bin/env node

import { client } from "./client/client.gen";
import { config } from "./config";
import { server } from "./server";
import express from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { randomUUID } from "crypto";

async function main() {
  // Initialize Axios Client
  // timeout 30s verhindert unendliches Haengen bei Coda-Latenz-Spitzen.
  // Ohne timeout wartet axios per Default ewig, der MCP-Aufruf schlaegt dann als
  // "timeout" beim Client auf, obwohl der Server nie eine saubere Fehler-Response
  // wirft. Nach Post-Rebrand (Coda -> Superhuman Docs, 08.07.2026) haben wir
  // sporadische Latenzen bei list_rows/delete_page gesehen; 30s deckt normale
  // Backend-Trage ab, ohne Retry-Sturm zu triggern.
  client.setConfig({
    baseURL: "https://coda.io/apis/v1",
    timeout: 30000,
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
    },
  });

  // Initialize Express + HTTP/SSE Transport
  const app = express();
  app.use(express.json());

  const transports = new Map<string, StreamableHTTPServerTransport>();

  app.post("/mcp", async (req, res) => {
    const sessionId = (req.headers["mcp-session-id"] as string) || randomUUID();
    let transport = transports.get(sessionId);

    if (!transport) {
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => sessionId,
      });
      transports.set(sessionId, transport);
      await server.connect(transport);
    }

    await transport.handleRequest(req, res, req.body);
  });

  app.get("/mcp", async (req, res) => {
    const sessionId = req.headers["mcp-session-id"] as string;
    const transport = transports.get(sessionId);
    if (transport) {
      await transport.handleRequest(req, res);
    } else {
      res.status(404).send("Session not found");
    }
  });

  app.delete("/mcp", async (req, res) => {
    const sessionId = req.headers["mcp-session-id"] as string;
    transports.delete(sessionId);
    res.status(200).send("OK");
  });

  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.error(`Coda MCP server running on port ${PORT}`);
  });
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
