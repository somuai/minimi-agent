import dotenv from "dotenv";
import { startServer } from "./server.js";
import { runCLI } from "./cli.js";

dotenv.config();

const port = parseInt(process.env.PORT || "3000", 10);

console.log("\n========================================================");
console.log("   BOOTING CHRONOS AGENT (Minimi Evaluation Target)      ");
console.log("   Node.js / TypeScript | Zero Pre-Seeded Mock Data     ");
console.log("========================================================");

// Start Web Server
startServer(port);

// If stdout is a TTY and CLI flag or default terminal run, also launch interactive CLI
if (process.stdout.isTTY && !process.env.SERVER_ONLY) {
  console.log(`[CHRONOS] Running in unified mode (Web Server + Interactive CLI).\n`);
  setTimeout(() => {
    runCLI().catch(console.error);
  }, 100);
} else {
  console.log(`[CHRONOS] Server active in headless mode on port ${port}.\n`);
}
