# Chronos: Architecture & System Design Specification
## Minimi Chat Agent Hiring Challenge

---

### 1. How It Works

Chronos is a high-performance temporal conversational agent with a single tool: **Web Search**. It is designed specifically to solve temporal episodic amnesia and epistemic drift without relying on synthetic pre-seeded mock data.

The system executes a deterministic 4-stage pipeline:

```
[User Turn / File Upload]
           │
           ▼
┌─────────────────────────┐
│ Dynamic Ingestion Engine│ ──► Parses Markdown/JSON/TXT, extracts dates, entities, and claims
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
│ Relational Episodic DB  │ ──► better-sqlite3 in WAL mode. Executes index-backed range scans:
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

1. **Dynamic User Ingestion**: The database starts completely empty. Context enters either via real-time conversational turns or user-uploaded files (meeting transcripts, Markdown notes, vendor shortlists). The parser extracts dates and structured entity assertions (pricing, features).
2. **Deterministic Temporal Anchor Layer**: Maps natural language expressions ("Monday", "3 November", "Last Tuesday", "yesterday") into ISO-8601 UTC timestamp intervals.
3. **Relational Episodic Store**: Implemented with `better-sqlite3` in WAL mode. Relational indexing on `created_at` and `entity_name` delivers sub-millisecond retrieval.
4. **Concurrent Multi-Query Fan-Out**: When verifying five shortlisted entities, Chronos dispatches five parallel search queries simultaneously via `Promise.allSettled`, completing in ~1.1s rather than a 15-second sequential loop.
5. **Epistemic Delta Synthesizer**: Contrasts historical claims against fresh search snippets and streams a structured comparison matrix with grounded citation links.

---

### 2. Why We Built It This Way

- **Zero Pre-Seeded Mock Data**: Real users do not operate on synthetic hardcoded databases. The agent starts clean, accepting dynamic uploads and remembering every conversation turn.
- **Relational vs Vector Retrieval for Dates**: Vector embeddings conflate semantic similarity with chronological time. A search for "What did I ask on 3 November" requires strict calendar bounds (`date = 2026-11-03`), which a relational B-tree index guarantees deterministically.
- **Latency Budget (TTFT < 350ms)**: By executing parallel search fan-outs and token streaming, Chronos maintains a fluid conversational feel comparable to the fastest web agents.
- **Autonomous Fallback Resilience**: Supports Tavily and Serper, but features an autonomous web-scraping fallback and disk cache, ensuring full execution without third-party API keys.

---

### 3. What We Considered and Rejected

1. **Rejected: Pure Semantic Vector Search (Dense Embeddings)**
   - *Reason*: Vector databases struggle with strict temporal filters (e.g. "between Monday and Tuesday"). Dense vectors frequently retrieve semantically close messages from the wrong month.
2. **Rejected: Sequential ReAct Agent Loops (LangChain / LlamaIndex style)**
   - *Reason*: Evaluating five CRM candidates sequentially requires 5 round-trips of LLM thought + search execution, consuming 15 to 25 seconds.
3. **Rejected: Cloud Vector Infrastructure (Pinecone / Qdrant Cloud)**
   - *Reason*: Adds network roundtrip latency, requires external credentials, and violates local-first privacy principles championed by Minimi.
4. **Rejected: Hardcoded Synthetic Pre-Seeding**
   - *Reason*: Synthetic pre-seeding is brittle and does not test how an agent ingests real user documents or builds its memory dynamically.

---

### 4. What We Would Do With Another Week

1. **Native macOS Menu Bar & Accessibility Helper**:
   - Package the engine into an Electron/Tauri tray app integrating macOS Accessibility APIs (`AXUIElement`) to replicate Minimi's ambient loop capture across active windows without manual uploads.
2. **Local SLM Ingestion & Embedding**:
   - Integrate an ONNX-runtime local small language model (e.g. SmolLM2-360M or BGE-small via WebAssembly) for zero-latency on-device entity extraction.
3. **Bidirectional MCP Server**:
   - Expose Chronos as a standard Model Context Protocol (MCP) server so Claude Desktop, Cursor, and Gemini can tap into the local episodic store directly.
4. **Automatic Epistemic Background Monitor**:
   - Add a lightweight cron daemon to re-verify critical shortlisted vendors in the background and pop a native notification when pricing or breaking changes are detected.
