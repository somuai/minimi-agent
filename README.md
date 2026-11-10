# Chronos: High-Performance Temporal Chat Agent with Web Search

> Built for the **Minimi Software Engineering Challenge**  
> Challenge Target: *"Build the best chat agent you can with one tool, web search. It should answer fast, get things right, and remember what you asked and when."*

---

## Overview

Chronos is a local-first conversational agent engineered in TypeScript/Node.js. It features a single autonomous tool: **Web Search**.

Unlike traditional agents that suffer from temporal amnesia or 20-second sequential search loops, Chronos pairs **dynamic user ingestion** (zero pre-seeded data) with **deterministic temporal grounding**, a **relational episodic store (`better-sqlite3`)**, and a **concurrent multi-query search fan-out protocol (`Promise.allSettled`)**.

```
[User Turn / File Upload]
           │
           ▼
┌─────────────────────────┐
│ Dynamic Ingestion Engine│ ──► Parses Markdown/JSON/TXT/CSV, extracts dates & entity claims
└──────────┬──────────────┘
           │
           ▼
┌─────────────────────────┐
│ Deterministic Temporal  │ ──► Resolves relative expressions ("Monday", "3 November", "Last Tuesday")
│ Anchor Layer            │     into precise ISO-8601 interval boundaries: [T_start, T_end]
└──────────┬──────────────┘
           │
           ▼
┌─────────────────────────┐
│ Relational Episodic DB  │ ──► better-sqlite3 in WAL mode with B-tree indices on created_at
│ (Local-First Store)     │     SELECT * FROM messages WHERE created_at BETWEEN ? AND ?
└──────────┬──────────────┘
           │
           ▼
┌─────────────────────────┐
│ Parallel Search Fan-Out │ ──► Dispatches concurrent Promise.allSettled search queries
│ Protocol                │     across all identified entities in parallel (<1200ms total)
└──────────┬──────────────┘
           │
           ▼
┌─────────────────────────┐
│ Epistemic Delta Matrix  │ ──► Contrasts historical user claims with live web search snippets:
│ Synthesizer             │     Outputs structured delta table (UNCHANGED / UPDATED / NEW_FEATURE)
└─────────────────────────┘
```

---

## Key Architectural Principles

1. **Zero Pre-Seeded Mock Data**:
   The database starts completely empty. Context enters either through interactive conversation turns or user-uploaded documents (meeting notes, transcripts, vendor shortlists).
2. **Deterministic Temporal Anchor Layer**:
   Converts human date expressions (*"On Monday"*, *"3 November"*, *"Last Tuesday"*, *"yesterday"*) into exact UTC timestamp intervals (`[start_ts, end_ts]`) before memory retrieval.
3. **Relational Episodic Memory (`better-sqlite3` WAL Mode)**:
   Avoids semantic vector conflation by using structured B-tree range queries for calendar filtering.
4. **Concurrent Multi-Query Fan-Out**:
   When verifying five shortlisted entities, Chronos issues five parallel search queries concurrently, completing the entire web round-trip in ~1.1s.
5. **Epistemic Delta Verification**:
   Contrasts user assertions against fresh search snippets to detect price hikes, plan deprecations, or feature releases.
6. **Zero-Configuration Portability**:
   Runs out of the box with `npm install && npm run dev`. Works with Tavily, Serper, Gemini, Groq, or OpenAI, and includes autonomous fallback web search and synthesis for zero-credential environments.

---

## Quickstart

### Prerequisites
- Node.js >= 18.0.0 (Tested on Node 22.18.0)
- npm >= 9.0.0

### Installation & Launch

```bash
# Clone the repository
git clone https://github.com/somuai/minimi-agent.git
cd minimi-agent

# Install dependencies (strictly npm install)
npm install

# Start Chronos (launches unified Web UI + Interactive CLI)
npm run dev
```

The Web UI will be active at:
```
http://localhost:3000
```

---

## Testing the Evaluation Prompts

You can test Chronos using either the **Web UI** or the **CLI**.

### Option A: Interactive Web UI (Recommended)
1. Open `http://localhost:3000` in your browser.
2. Drag and drop any note or sample file from `examples/` into the upload zone (or paste your own meeting transcript):
   - `examples/crm_shortlist_monday.md` (Dated Monday, November 9, 2026: shortlisting 5 CRMs)
   - `examples/postgres_hosting_tuesday.md` (Dated Tuesday, November 3, 2026: Postgres hosting)
3. Ask the evaluation questions:
   - *"On Monday we shortlisted 5 CRM tools for a 20-person sales team. Has any of them changed pricing or shipped something big since?"*
   - *"What did I ask you on 3 November? Is your answer still correct today?"*
   - *"Last Tuesday I asked you about Postgres hosting. Has any pricing changed since then?"*
4. Observe the live status chips (`PLANNING`, `PARALLEL SEARCH`, `COMPLETED IN Xms`) and the streamed Epistemic Delta table with source links.

### Option B: Terminal CLI
You can also run the terminal interface:

```bash
npm run cli
```

Commands in CLI:
- `/upload examples/crm_shortlist_monday.md`: Ingests document into episodic memory.
- `/files`: Lists all uploaded documents and their extracted dates.
- Type any question directly:
  `chronos> On Monday we shortlisted 5 CRM tools. Has any of them changed pricing since?`

---

## Repository Structure

```
minimi-agent/
├── src/
│   ├── index.ts               # Main unified entry point (Web server + CLI)
│   ├── server.ts              # Lightweight HTTP server with SSE chat & file upload endpoints
│   ├── cli.ts                 # Interactive terminal interface with live status chips
│   ├── db/
│   │   └── database.ts        # better-sqlite3 WAL store with temporal indexing
│   ├── ingest/
│   │   └── fileParser.ts      # Multi-format user document ingestion (MD, TXT, JSON, CSV)
│   ├── temporal/
│   │   └── resolver.ts        # Deterministic relative date parser (ISO-8601 intervals)
│   ├── tools/
│   │   └── search.ts          # Parallel Web Search tool with Tavily, Serper, and DDG fallback
│   └── agent/
│       ├── planner.ts         # Intent classification & parallel query planner
│       └── synthesizer.ts     # Epistemic delta matrix synthesizer with token streaming
├── public/
│   └── index.html             # Sleek dark-mode Web UI with file drag-and-drop
├── examples/
│   ├── crm_shortlist_monday.md
│   └── postgres_hosting_tuesday.md
├── DESIGN.md                  # 1-page system architecture specification for Minimi team
├── .env.example               # Declared API keys (Tavily, Serper, Gemini, Groq, OpenAI)
├── package.json
└── tsconfig.json
```

---

## Configuration (`.env.example`)

Chronos operates with full fallback capabilities even without API keys. To connect external providers:

```bash
# Web Search Providers (Optional)
TAVILY_API_KEY=your_key_here
SERPER_API_KEY=your_key_here

# LLM Providers (Optional - Any one)
GEMINI_API_KEY=your_key_here
GROQ_API_KEY=your_key_here
OPENAI_API_KEY=your_key_here
ANTHROPIC_API_KEY=your_key_here

# Port Configuration
PORT=3000
DATABASE_PATH=./data/chronos.db
```

---

## Architectural Deep Dive

See [DESIGN.md](file:///Users/soumyajitghosh/Documents/minimi-agent/DESIGN.md) for the detailed 1-page architectural breakdown covering why this was built, design alternatives considered and rejected, and future directions.
