import { EpisodicDatabase, DBEpisodicEntity, DBMessage } from "../db/database.js";
import { TemporalResolver, TemporalWindow } from "../temporal/resolver.js";

export type AgentIntent = "DIRECT_ANSWER" | "HISTORICAL_RECALL" | "EPISTEMIC_DELTA_VERIFICATION" | "GENERAL_WEB_SEARCH";

export interface ExecutionPlan {
  intent: AgentIntent;
  temporalWindows: TemporalWindow[];
  targetEntities: DBEpisodicEntity[];
  pastMessages: DBMessage[];
  searchQueries: string[];
  explanation: string;
}

export class AgentPlanner {
  constructor(private db: EpisodicDatabase) {}

  public plan(userPrompt: string, referenceDate: Date = new Date()): ExecutionPlan {
    const normalized = userPrompt.toLowerCase();

    // 1. Resolve temporal anchors
    const windows = TemporalResolver.resolve(userPrompt, referenceDate);
    const hasTemporal = windows.length > 0;

    // 2. Detect keywords for epistemic drift / verification
    const driftKeywords = [
      "changed",
      "still correct",
      "still true",
      "pricing changed",
      "pricing",
      "shipped something",
      "shipped",
      "update",
      "updates",
      "new features",
      "since then",
      "since",
    ];
    const isDriftCheck = driftKeywords.some((k) => normalized.includes(k));

    // 3. Detect historical recall keywords
    const recallKeywords = [
      "what did i ask",
      "shortlisted",
      "i asked you",
      "did we discuss",
      "last time",
      "earlier",
      "what was your answer",
      "remember",
      "recall",
    ];
    const isRecall = recallKeywords.some((k) => normalized.includes(k));

    // Case A: Epistemic Delta Verification (Historical recall + Live drift verification)
    if (hasTemporal && (isDriftCheck || isRecall)) {
      const window = windows[0];
      const pastMessages = this.db.queryMessagesInInterval(window.startTimestamp, window.endTimestamp);
      let pastEntities = this.db.queryEntitiesInInterval(window.startTimestamp, window.endTimestamp);

      // If no entities directly in interval, check all uploaded files or recent messages for matching context
      if (pastEntities.length === 0) {
        pastEntities = this.db.getAllEntities();
      }

      // Generate parallel search queries for each detected entity
      const searchQueries = pastEntities.map((ent) => {
        return `${ent.entity_name} pricing changelog release updates 2026`;
      });

      // If no specific entities found yet, generate focused search query from prompt
      if (searchQueries.length === 0) {
        searchQueries.push(`${userPrompt} latest updates 2026`);
      }

      return {
        intent: "EPISTEMIC_DELTA_VERIFICATION",
        temporalWindows: windows,
        targetEntities: pastEntities,
        pastMessages,
        searchQueries: searchQueries.slice(0, 5), // Max 5 concurrent parallel queries
        explanation: `Resolved temporal interval [${window.start.toISOString()} - ${window.end.toISOString()}]. Found ${pastEntities.length} tracked entities. Initiating parallel search verification.`,
      };
    }

    // Case B: Pure Historical Recall (No web drift check requested)
    if (hasTemporal && isRecall) {
      const window = windows[0];
      const pastMessages = this.db.queryMessagesInInterval(window.startTimestamp, window.endTimestamp);
      const pastEntities = this.db.queryEntitiesInInterval(window.startTimestamp, window.endTimestamp);

      return {
        intent: "HISTORICAL_RECALL",
        temporalWindows: windows,
        targetEntities: pastEntities,
        pastMessages,
        searchQueries: [],
        explanation: `Retrieving conversation and user documents from ${window.raw}.`,
      };
    }

    // Case C: General Web Search (e.g. current events, live documentation, market queries)
    const searchTriggers = ["who is", "what is", "latest", "pricing of", "features of", "compare", "search"];
    const needsSearch = searchTriggers.some((t) => normalized.includes(t)) || userPrompt.includes("?");

    if (needsSearch) {
      return {
        intent: "GENERAL_WEB_SEARCH",
        temporalWindows: [],
        targetEntities: [],
        pastMessages: [],
        searchQueries: [userPrompt],
        explanation: "Live web search required for current verification.",
      };
    }

    // Case D: Direct Conversational Answer
    return {
      intent: "DIRECT_ANSWER",
      temporalWindows: [],
      targetEntities: [],
      pastMessages: [],
      searchQueries: [],
      explanation: "Direct conversational generation.",
    };
  }
}
