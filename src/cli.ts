import readline from "node:readline";
import path from "node:path";
import dotenv from "dotenv";
import { EpisodicDatabase } from "./db/database.js";
import { FileIngestionEngine } from "./ingest/fileParser.js";
import { AgentPlanner } from "./agent/planner.js";
import { SearchTool } from "./tools/search.js";
import { AgentSynthesizer } from "./agent/synthesizer.js";

dotenv.config();

export async function runCLI(): Promise<void> {
  const db = new EpisodicDatabase();
  const ingestion = new FileIngestionEngine(db);
  const planner = new AgentPlanner(db);
  const searchTool = new SearchTool(db);
  const synthesizer = new AgentSynthesizer();

  const conversationId = db.getOrCreateConversation("cli-session", "Interactive CLI Session");

  console.log("\n========================================================");
  console.log("   CHRONOS: High-Performance Temporal Chat Agent        ");
  console.log("   Single Tool: Web Search | Episodic Memory & Uploads  ");
  console.log("========================================================");
  console.log("Commands:");
  console.log("  /upload <path>   Ingest user document, notes, or transcript");
  console.log("  /files           List all ingested user documents");
  console.log("  /clear           Start a new conversation session");
  console.log("  /exit            Exit the agent\n");

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const promptUser = () => {
    rl.question("\nchronos> ", async (input) => {
      const trimmed = input.trim();
      if (!trimmed) {
        promptUser();
        return;
      }

      if (trimmed === "/exit") {
        console.log("Shutting down Chronos agent. Goodbye.");
        db.close();
        rl.close();
        process.exit(0);
      }

      if (trimmed === "/files") {
        const files = db.getAllUploadedFiles();
        if (files.length === 0) {
          console.log("[FILES] No user files uploaded yet. Use /upload <filepath> to add documents.");
        } else {
          console.log(`[FILES] Ingested Documents (${files.length}):`);
          for (const f of files) {
            const date = new Date(f.extracted_date).toISOString().split("T")[0];
            console.log(`  - ${f.filename} (Dated: ${date}, Uploaded: ${new Date(f.uploaded_at).toLocaleTimeString()})`);
          }
        }
        promptUser();
        return;
      }

      if (trimmed.startsWith("/upload ")) {
        const filePath = trimmed.slice(8).trim();
        try {
          console.log(`[INGEST] Parsing user file: ${filePath}...`);
          const result = await ingestion.ingestFile(filePath);
          console.log(`[SUCCESS] Ingested "${result.filename}" with extracted date ${result.extractedDate.toISOString().split("T")[0]}.`);
          console.log(`[SUCCESS] Tracked ${result.entityCount} entities and claims from user document.`);
        } catch (e: any) {
          console.error(`[ERROR] Ingestion failed: ${e.message}`);
        }
        promptUser();
        return;
      }

      // Normal chat flow
      try {
        const startTime = Date.now();
        process.stdout.write("[PLAN] Resolving temporal anchors & intent... ");
        const plan = planner.plan(trimmed);
        console.log(`Intent: ${plan.intent}`);

        // Save user message to database
        db.saveMessage(conversationId, "user", trimmed);

        let searchResponses: any[] = [];
        if (plan.searchQueries.length > 0) {
          process.stdout.write(`[SEARCH] Parallel search fan-out (${plan.searchQueries.length} queries)... `);
          searchResponses = await searchTool.searchParallel(plan.searchQueries);
          console.log(`Done (${Date.now() - startTime}ms)`);
        }

        console.log("\n--- CHRONOS RESPONSE ---");
        const answer = await synthesizer.synthesize(trimmed, {
          plan,
          searchResults: searchResponses,
          recentMessages: db.getRecentMessages(10),
          onToken: (tok) => process.stdout.write(tok),
        });

        // Save assistant response to database
        db.saveMessage(conversationId, "assistant", answer);
        console.log(`\n\n[TURN COMPLETED in ${Date.now() - startTime}ms]`);
      } catch (err: any) {
        console.error(`\n[ERROR] Turn execution error: ${err.message}`);
      }

      promptUser();
    });
  };

  promptUser();
}

if (process.argv[1]?.endsWith("cli.ts") || process.argv[1]?.endsWith("cli.js")) {
  runCLI().catch(console.error);
}
