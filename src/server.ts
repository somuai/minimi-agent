import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { EpisodicDatabase } from "./db/database.js";
import { FileIngestionEngine } from "./ingest/fileParser.js";
import { AgentPlanner } from "./agent/planner.js";
import { SearchTool } from "./tools/search.js";
import { AgentSynthesizer } from "./agent/synthesizer.js";

export function startServer(port: number = 3000): http.Server {
  const db = new EpisodicDatabase();
  const ingestion = new FileIngestionEngine(db);
  const planner = new AgentPlanner(db);
  const searchTool = new SearchTool(db);
  const synthesizer = new AgentSynthesizer();

  const publicDir = path.resolve("./public");

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || "/", `http://${req.headers.host}`);

    // CORS headers
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    // Static Web UI
    if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
      const htmlPath = path.join(publicDir, "index.html");
      if (fs.existsSync(htmlPath)) {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        fs.createReadStream(htmlPath).pipe(res);
        return;
      }
    }

    // API: Stats & Uploaded Files
    if (req.method === "GET" && url.pathname === "/api/stats") {
      const files = db.getAllUploadedFiles();
      const entities = db.getAllEntities();
      const messages = db.getRecentMessages(20);

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          uploadedFiles: files,
          trackedEntities: entities,
          messageCount: messages.length,
        })
      );
      return;
    }

    // API: Ingest File Upload
    if (req.method === "POST" && url.pathname === "/api/upload") {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", async () => {
        try {
          const payload = JSON.parse(body);
          const { filename, content, fileType = "markdown" } = payload;
          if (!filename || !content) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Missing filename or content" }));
            return;
          }

          const result = await ingestion.ingestContent(filename, fileType, content);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: true, result }));
        } catch (err: any) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: err.message }));
        }
      });
      return;
    }

    // API: Chat (SSE Streaming)
    if (req.method === "POST" && url.pathname === "/api/chat") {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", async () => {
        try {
          const payload = JSON.parse(body);
          const { message, conversationId = "web-session" } = payload;
          if (!message) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Missing prompt message" }));
            return;
          }

          // Setup SSE Stream
          res.writeHead(200, {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
          });

          const startTime = Date.now();
          const plan = planner.plan(message);

          // Save user prompt
          db.saveMessage(conversationId, "user", message);

          // Send plan event
          res.write(
            `data: ${JSON.stringify({
              type: "plan",
              intent: plan.intent,
              explanation: plan.explanation,
              queries: plan.searchQueries,
            })}\n\n`
          );

          // Parallel Web Search
          let searchResponses: any[] = [];
          if (plan.searchQueries.length > 0) {
            searchResponses = await searchTool.searchParallel(plan.searchQueries);
            res.write(
              `data: ${JSON.stringify({
                type: "search_completed",
                count: searchResponses.length,
                sources: searchResponses.map((s) => s.source),
              })}\n\n`
            );
          }

          // Synthesize response with token streaming
          const answer = await synthesizer.synthesize(message, {
            plan,
            searchResults: searchResponses,
            recentMessages: db.getRecentMessages(10),
            onToken: (tok) => {
              res.write(`data: ${JSON.stringify({ type: "token", token: tok })}\n\n`);
            },
          });

          // Save assistant answer
          db.saveMessage(conversationId, "assistant", answer);

          res.write(
            `data: ${JSON.stringify({
              type: "done",
              latencyMs: Date.now() - startTime,
            })}\n\n`
          );
          res.end();
        } catch (err: any) {
          res.write(`data: ${JSON.stringify({ type: "error", message: err.message })}\n\n`);
          res.end();
        }
      });
      return;
    }

    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not Found");
  });

  server.listen(port, () => {
    console.log(`[CHRONOS SERVER] Web application active at http://localhost:${port}`);
  });

  return server;
}
