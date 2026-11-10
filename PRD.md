# Project Chronos: High-Performance Temporal Chat Agent
## Senior Software Development Lead (Amazon L6 / Senior SDL) Product Requirements Document (PRD) & Working Backwards Specification

---

## 1. Executive Summary & Working Backwards Press Release (PR/FAQ)

### 1.1 Press Release

**FOR IMMEDIATE RELEASE**  
**SEATTLE & BENGALURU — November 11, 2026**

Today, the engineering team announced **Chronos**, a high-performance temporal conversational agent designed to eliminate context amnesia and epistemic drift for knowledge workers, engineering leads, and technical founders. Chronos pairs dynamic user ingestion with an autonomous single-tool web search engine to remember exact conversational and document contexts over time while instantly verifying whether past assertions remain accurate against real-world shifts.

In modern knowledge workflows, users evaluate critical SaaS platforms, cloud infrastructure, and operational tools across days or weeks. However, existing conversational AI agents suffer from acute temporal blindness: standard dense vector embeddings cannot resolve deterministic calendar boundaries (such as "what did I ask on 3 November" or "what we shortlisted on Monday"), and sequential tool execution creates unacceptably high conversational latency exceeding 20 seconds. Furthermore, when reality changes—such as vendor pricing adjustments or breaking feature releases—traditional agents provide hallucinated or stale information because they lack an epistemic mechanism to contrast past baseline assertions against live web telemetry.

Chronos solves this through a local-first, zero-pre-seeded architecture. Operating without synthetic mock data, Chronos dynamically ingests user-provided documents, meeting transcripts, and live conversation turns into an indexed relational episodic store (`better-sqlite3` in WAL mode). When queried, a deterministic temporal anchor layer maps human date expressions into precise ISO-8601 UTC intervals, retrieves the historical baseline assertions, and dispatches parallel search queries across all target entities concurrently via `Promise.allSettled`. Within 1.2 seconds, Chronos synthesizes an Epistemic Delta Matrix contrasting past assertions with fresh search snippets, delivering verified answers with grounded citations.

"Knowledge workers shouldn't have to re-explain their past evaluations or manually search five vendor pricing pages to see what changed since Monday," said a Senior Systems Architect on the project. "Chronos delivers ambient, date-accurate memory combined with sub-second parallel web verification, ensuring users always know what was decided and what has shifted."

Chronos is open-source, runs natively on Node.js and TypeScript via `npm install && npm run dev`, and supports both an interactive terminal CLI and a real-time streaming Web UI.

---

### 1.2 Customer & Engineering FAQ

#### Q1: What customer problem does Chronos solve?
**Answer**: Users make decisions based on dynamic market and technical information (e.g., evaluating five CRM tools or comparing cloud database pricing). Days or weeks later, they ask questions like *"Has any pricing changed since our shortlist on Monday?"* or *"Is what you told me on 3 November still true today?"*. Standard AI models either hallucinate that nothing changed, forget the baseline entities, or execute slow sequential search loops. Chronos provides instant recall of past user uploads and conversations, runs parallel web searches across all candidate entities, and presents a verified delta report.

#### Q2: Why is there zero pre-seeded data?
**Answer**: Synthetic pre-seeding is brittle, artificial, and hides real-world edge cases. In production, users bring their own transcripts, markdown evaluation notes, and live chat history. Chronos boots with a completely empty, initialized database schema. Context enters strictly through user file uploads (drag-and-drop or CLI `/upload`) and real-time conversation turns, testing true dynamic memory ingestion.

#### Q3: Why use a relational database (SQLite) instead of a vector database (Pinecone/Chroma)?
**Answer**: Vector similarity search is fundamentally ill-suited for strict temporal filtering. An embedding cannot deterministically isolate messages where `created_at >= '2026-11-03T00:00:00Z'` and `created_at <= '2026-11-03T23:59:59Z'`; vector search frequently returns semantically similar queries from the wrong month or year. SQLite provides microsecond B-tree range queries, zero external network hops, zero container dependencies, and full ACID compliance on local disk.

#### Q4: How does Chronos achieve conversational speed with web search?
**Answer**: Sequential ReAct agents query search engines one entity at a time, resulting in $O(N)$ network roundtrips. For five entities, this takes 15 to 25 seconds. Chronos uses a Query Planner that extracts all entities from the retrieved episodic window and fires parallel asynchronous queries via `Promise.allSettled` in a single event-loop tick. The entire search fan-out completes in the time of the slowest single query (~1.1s).

---

## 2. Core Leadership Principles & Architecture Tenets

1. **Customer-Grounded Truth Over Speculative Completion**: Never fabricate past decisions or guess current pricing. Base past assertions strictly on ingested user data and current facts on grounded web search snippets with citation URLs.
2. **Deterministic Temporal Anchors**: Treat time as a first-class mathematical interval. Parse human temporal references ("Monday", "3 November", "Last Tuesday") into explicit UTC bounding boxes before executing data lookups.
3. **Zero Cold-Start Baggage**: Never hide fake seed records in the repository. Provide robust document parsers and intuitive dropzones so users can load their own context effortlessly.
4. **Latency as a Critical Constraint**: Conversational flow breaks if response latency exceeds 2 seconds. Enforce parallel asynchronous fan-out, microsecond relational reads, and streaming token delivery.
5. **Blast-Radius Containment & Zero-Config Portability**: The system must run immediately with `npm install` and `npm run dev` across any standard Node environment without requiring external Docker daemons, complex native build toolchains, or mandatory paid API keys.

---

## 3. Product Requirements Document (PRD)

### 3.1 User Personas

| Persona | Role | Primary Objective | Key Pain Point |
| :--- | :--- | :--- | :--- |
| **Persona A: Technical Founder / CTO** | Fast-paced operational decision maker | Evaluates infrastructure (databases, inference engines, CRMs) across vendors | Loses track of historical vendor pricing and feature claims when returning to an evaluation days later |
| **Persona B: Engineering Lead / SDE** | Systems designer | Tracks architectural proposals and meeting commitments | Current LLMs forget specific action items from past meetings or hallucinate outdated API documentation |
| **Persona C: Minimi Challenge Evaluator** | Automated / Human Evaluation Harness | Stress-tests temporal grounding, episodic memory, and web search accuracy | Standard agents fail relative-date queries and take 20+ seconds to answer multi-entity drift checks |

---

### 3.2 Evaluation Test Suite Alignment

| Scenario ID | Test Prompt | Ground Truth Source | Target Verification Mechanism | Success Criteria |
| :--- | :--- | :--- | :--- | :--- |
| **TC-01** | *"On Monday we shortlisted 5 CRM tools for a 20-person sales team. Has any of them changed pricing or shipped something big since?"* | User-uploaded markdown/transcript from Monday (e.g. Attio, HubSpot, Close, Pipedrive, Folk) | Temporal resolution of "Monday" -> fetch 5 entities -> 5x parallel web searches -> epistemic delta synthesis | Response contains structured matrix comparing baseline pricing with live web findings in under 1800ms |
| **TC-02** | *"What did I ask you on 3 November? Is your answer still correct today?"* | Past conversation turn or uploaded session log dated 3 November 2026 | Strict day interval lookup -> extract prior question and response -> live web fact-check -> self-contradiction analysis | Correctly recalls exact historical prompt; accurately confirms or corrects prior answer with citations |
| **TC-03** | *"Last Tuesday I asked you about Postgres hosting. Has any pricing changed since then?"* | User notes or past conversation from previous Tuesday regarding Neon, Supabase, etc. | Relative day offset calculation -> database entity scan -> parallel cloud pricing search -> delta comparison | Pinpoints specific changes (compute tiers, free tier adjustments) or confirms pricing stability |

---

### 3.3 Functional Requirements (FR)

#### FR-01: Dynamic Document & File Ingestion Engine
- **FR-01.1**: The system must ingest user documents in Markdown (`.md`), Plain Text (`.txt`), JSON (`.json`), and CSV (`.csv`) formats.
- **FR-01.2**: Ingestion must be accessible via both an interactive Web UI (drag-and-drop file dropzone) and an interactive CLI command (`/upload <filepath>`).
- **FR-01.3**: The ingestion engine must inspect file headers and contents to extract document creation or reference dates using natural language date heuristics.
- **FR-01.4**: The parser must extract structured entities (vendor names, tools), categories, and baseline assertions (pricing numbers, feature commitments) and index them in the database.

#### FR-02: Real-Time Conversational Memory Tracking
- **FR-02.1**: Every live interaction between user and assistant must be recorded in the local store with an explicit POSIX millisecond timestamp (`created_at`).
- **FR-02.2**: The agent must extract entities and assertions from live conversational turns in real time without requiring manual file uploads.
- **FR-02.3**: Conversation sessions must support multi-turn dialogues with session scoping.

#### FR-03: Deterministic Temporal Anchor Layer
- **FR-03.1**: The system must resolve natural language calendar dates ("3 November", "November 3rd", "Nov 3") into a UTC interval spanning `00:00:00.000` to `23:59:59.999`.
- **FR-03.2**: The system must resolve relative day offsets ("Monday", "last Tuesday", "yesterday", "this week") relative to the system's current clock.
- **FR-03.3**: The resolved window must be passed to the storage engine as explicit numerical range parameters (`BETWEEN :start_ts AND :end_ts`).

#### FR-04: Single-Tool Web Search Orchestrator
- **FR-04.1**: Web Search must be the sole external tool available to the agent.
- **FR-04.2**: When multiple entities require verification, the orchestrator must construct individual, entity-specific queries and execute them concurrently via `Promise.allSettled`.
- **FR-04.3**: The search tool must support external search providers (Tavily, Serper) when API keys are configured in `.env`.
- **FR-04.4**: The search tool must include an autonomous web-scraping fallback (DuckDuckGo instant answers / search parsing) ensuring the agent functions out-of-the-box with zero third-party credentials.
- **FR-04.5**: Search responses must be cached on disk with an expiration TTL to guarantee idempotency and microsecond repeat lookups.

#### FR-05: Epistemic Delta Synthesizer
- **FR-05.1**: When temporal verification is triggered, the synthesizer must construct an Epistemic Delta Matrix contrasting:
  1. Historical assertion recorded in user memory.
  2. Current reality discovered through live web search.
  3. Delta status classification: `UNCHANGED`, `UPDATED`, `NEW_FEATURE`, or `DEPRECATED`.
  4. Grounded citation links (URLs).
- **FR-05.2**: The output must stream tokens directly to stdout (CLI) and via Server-Sent Events (Web UI).

#### FR-06: Unified Multi-Modal Interfaces
- **FR-06.1**: Provide a responsive, dark-mode Web UI with file drag-and-drop, visual status chips (`PLANNING`, `SEARCHING`, `SYNTHESIZING`), and markdown table rendering.
- **FR-06.2**: Provide an interactive terminal CLI with command shortcuts (`/upload`, `/files`, `/clear`, `/exit`).

---

### 3.4 Non-Functional Requirements (NFR) & Amazon-Standard SLAs

```
                               Latency Budget Breakdown (P99)
┌──────────────────────┬───────────────────────┬─────────────────────────┬──────────────┐
│ Temporal Resolve     │ Relational Read       │ Parallel Search (5x)    │ LLM TTFT     │
│ <= 15ms              │ <= 5ms                │ <= 1100ms               │ <= 350ms     │
└──────────────────────┴───────────────────────┴─────────────────────────┴──────────────┘
Total Budget: < 1500ms End-to-End
```

| Dimension | Target Metric | Metric Definition & Verification Method |
| :--- | :--- | :--- |
| **P50 Latency** | < 800ms | End-to-end user turn turnaround when web search is executed |
| **P99 Latency** | < 1800ms | End-to-end turn turnaround with 5 concurrent parallel search queries |
| **Time-To-First-Token (TTFT)** | < 350ms | Time from search completion to first streamed token on stdout / SSE |
| **Memory Footprint** | < 65 MB RSS | Node.js process resident set size under steady-state operation |
| **Cold-Boot Startup** | < 200ms | Execution of `npm run dev` to HTTP port listening and CLI prompt ready |
| **Data Durability** | ACID / Local WAL | Zero data loss on abrupt process termination via SQLite write-ahead logging |
| **Dependency Footprint** | Zero Native Compiles | Pure JavaScript/TypeScript dependencies with zero external container requirements |

---

## 4. Systems Architecture & Detailed Design

### 4.1 High-Level Component Diagram

```
+---------------------------------------------------------------------------------+
|                                 User Ingestion                                  |
|         (Web UI Dropzone / CLI /upload / Interactive Conversation Stream)       |
+----------------------------------------+----------------------------------------+
                                         |
                                         v
+---------------------------------------------------------------------------------+
|                             Chronos Core Controller                             |
|                                                                                 |
|   +------------------------------------+   +--------------------------------+   |
|   | Document & Message Parser          |   | Temporal Resolver              |   |
|   | - Extracts entities & assertions   |   | - Maps relative expressions    |   |
|   | - Auto-detects document dates      |   | - Outputs [start_ts, end_ts]   |   |
|   +-----------------+------------------+   +---------------+----------------+   |
|                     |                                      |                    |
|                     +-------------------+------------------+                    |
|                                         |                                       |
|                                         v                                       |
|   +-------------------------------------------------------------------------+   |
|   | Local Episodic Store (better-sqlite3 in WAL mode)                       |   |
|   | - Tables: conversations, messages, episodic_entities, uploaded_files    |   |
|   | - Indices: idx_messages_created_at, idx_entities_lookup                 |   |
|   +-------------------------------------+-----------------------------------+   |
|                                         |                                       |
|                                         v                                       |
|   +-------------------------------------------------------------------------+   |
|   | Intent Classifier & Query Planner                                       |   |
|   | - Classifies: DIRECT_ANSWER | HISTORICAL_RECALL | EPISTEMIC_DELTA       |   |
|   | - Constructs targeted search queries for each identified entity         |   |
|   +-------------------------------------+-----------------------------------+   |
|                                         |                                       |
|                                         v                                       |
|   +-------------------------------------------------------------------------+   |
|   | Concurrent Search Fan-Out Orchestrator (Single Tool)                    |   |
|   | - Dispatches parallel asynchronous searches via Promise.allSettled      |   |
|   | - Multi-provider: Tavily / Serper / Autonomous DuckDuckGo Scraper       |   |
|   | - Local disk response cache with TTL                                    |   |
|   +-------------------------------------+-----------------------------------+   |
|                                         |                                       |
|                                         v                                       |
|   +-------------------------------------------------------------------------+   |
|   | Epistemic Delta Synthesizer                                             |   |
|   | - Contrasts historical user claims against live search results          |   |
|   | - Emits structured markdown comparison matrix with grounded citations   |   |
|   | - Streaming SSE / Terminal token sink                                   |   |
|   +-------------------------------------------------------------------------+   |
+---------------------------------------------------------------------------------+
```

---

## 5. Security, Privacy & Operational Guardrails

### 5.1 Local-First Privacy Boundary
- **Zero Third-Party Embedding Egress**: Ingested notes and conversations are stored purely on local disk (`./data/chronos.db`). No raw document text is transmitted to third-party vector databases.
- **Search Sanitization**: When issuing web search calls, the Query Planner strips internal conversation identifiers, email headers, and sensitive metadata, transmitting only generalized vendor research queries (e.g., `"attio pricing changelog release updates 2026"`).

### 5.2 Blast-Radius & Error Containment
- **Search API Rate Limit Fallback**: If an external search provider returns HTTP 429 (Too Many Requests) or network timeouts, the orchestrator instantly falls back to the autonomous local scraping provider without terminating the user turn.
- **Strict Input Sanitization**: File uploads are capped at 5 MB per document to prevent memory exhaustion, and path traversal vulnerabilities are eliminated by ignoring client-specified storage paths.

---

## 6. Architectural Decision Records (One-Way vs Two-Way Doors)

### ADR-01: Relational SQLite Storage vs Dense Vector Database (One-Way Door)
- **Decision**: Select `better-sqlite3` as the primary episodic memory store. Reject vector databases (Chroma, Pinecone, Milvus).
- **Justification**: The core failure mode in temporal retrieval is fuzzy date matching. Dense vector similarity maps semantic closeness, not chronology. An exact query like "what did I ask on 3 November" requires strict calendar bounding, which a B-tree index on `created_at` computes in 2 milliseconds. SQLite provides zero deployment overhead, zero container dependencies, and 100% portability.

### ADR-02: Zero Pre-Seeded Data vs Synthetic Mock Database (Two-Way Door)
- **Decision**: Initialize the repository with an empty database. Provide first-class drag-and-drop file upload and CLI `/upload` capabilities.
- **Justification**: Pre-seeding creates fragile demos that fail under real user testing. Enabling dynamic user ingestion allows evaluators to drop their own meeting transcripts or run real multi-turn conversations, mirroring how Minimi captures ambient personal context.

### ADR-03: Single Tool Web Search Fan-Out vs Multi-Tool Routing (Two-Way Door)
- **Decision**: Constrain the toolset strictly to Web Search. Implement asynchronous multi-query fan-out.
- **Justification**: Meets the strict challenge rule (*"It has one tool: web search"*). Parallelizing search execution across all extracted entities solves the conversational latency problem without violating tool constraints.

---

## 7. Deliverables & Verification Checklist

- **Public Repository**: [somuai/minimi-agent](https://github.com/somuai/minimi-agent)
- **Local Implementation**: [/Users/soumyajitghosh/Documents/minimi-agent](file:///Users/soumyajitghosh/Documents/minimi-agent)
- **Design Document**: [DESIGN.md](https://github.com/somuai/minimi-agent/blob/main/DESIGN.md)
