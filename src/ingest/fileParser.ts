import fs from "node:fs";
import path from "node:path";
import { EpisodicDatabase } from "../db/database.js";
import { TemporalResolver } from "../temporal/resolver.js";

export interface ParsedEntityAssertion {
  entity: string;
  category: string;
  assertionType: string;
  assertionValue: string;
}

export interface IngestionResult {
  fileId: string;
  filename: string;
  extractedDate: Date;
  entityCount: number;
  entities: ParsedEntityAssertion[];
}

export class FileIngestionEngine {
  constructor(private db: EpisodicDatabase) {}

  public async ingestFile(filePath: string): Promise<IngestionResult> {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const filename = path.basename(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const content = fs.readFileSync(filePath, "utf-8");

    return this.ingestContent(filename, ext, content);
  }

  public async ingestContent(
    filename: string,
    fileType: string,
    content: string,
    defaultDate: Date = new Date()
  ): Promise<IngestionResult> {
    // 1. Detect document date from header or content
    const extractedDate = this.extractDocumentDate(content, defaultDate);

    // 2. Extract structured entities and assertions
    const entities = this.extractEntitiesAndAssertions(content);

    // 3. Save to database
    const fileId = this.db.saveUploadedFile(
      filename,
      fileType,
      content,
      extractedDate.getTime()
    );

    // Also record as a document message in default conversation
    const msgId = this.db.saveMessage(
      "default",
      "user",
      `[User Uploaded Document: ${filename}]\n${content}`,
      extractedDate.getTime()
    );

    // Save individual extracted assertions into episodic_entities
    for (const ent of entities) {
      this.db.saveEntity(
        "file_upload",
        fileId,
        ent.entity,
        ent.category,
        ent.assertionType,
        ent.assertionValue,
        extractedDate.getTime()
      );
    }

    return {
      fileId,
      filename,
      extractedDate,
      entityCount: entities.length,
      entities,
    };
  }

  private extractDocumentDate(content: string, fallbackDate: Date): Date {
    // Look for explicit date lines, e.g. "Date: 2026-11-03", "## 3 November 2026", "Monday, November 9"
    const lines = content.split("\n").slice(0, 15);
    for (const line of lines) {
      const windows = TemporalResolver.resolve(line, fallbackDate);
      if (windows.length > 0) {
        return windows[0].start;
      }
    }
    return fallbackDate;
  }

  private extractEntitiesAndAssertions(content: string): ParsedEntityAssertion[] {
    const assertions: ParsedEntityAssertion[] = [];
    const lines = content.split("\n");

    // Common entity extraction heuristics: bullet items, tables, colons
    // e.g. "- HubSpot: $20/seat/month, strong inbound marketing"
    // e.g. "Neon: $19/mo serverless branching"
    // e.g. "| Attio | $34/mo | Product-led CRM |"
    const bulletRegex = /^[-*•]\s*([A-Za-z0-9_\s.]{2,25})[:\-–](.+)$/;
    const pricingRegex = /(\$\d+(?:\.\d+)?(?:\/(?:user|seat|mo|month|gb|hr))?|\bfree\b|\bcustom\b|\benterprise\b)/i;

    for (const line of lines) {
      const trimmed = line.trim();
      const match = trimmed.match(bulletRegex);
      if (match) {
        const entityName = match[1].trim();
        const details = match[2].trim();
        const priceMatch = details.match(pricingRegex);

        assertions.push({
          entity: entityName,
          category: this.inferCategory(details),
          assertionType: priceMatch ? "pricing" : "feature",
          assertionValue: details,
        });
      } else if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
        // Markdown table row
        const cells = trimmed.split("|").map((c) => c.trim()).filter(Boolean);
        if (cells.length >= 2 && !cells[0].includes("---") && !cells[0].toLowerCase().includes("name") && !cells[0].toLowerCase().includes("tool")) {
          const entityName = cells[0];
          const details = cells.slice(1).join(" | ");
          assertions.push({
            entity: entityName,
            category: this.inferCategory(details),
            assertionType: details.match(pricingRegex) ? "pricing" : "overview",
            assertionValue: details,
          });
        }
      }
    }

    // Fallback: if no bullets/tables, scan for known vendors/technologies
    if (assertions.length === 0) {
      const knownTech = [
        "HubSpot", "Pipedrive", "Close", "Attio", "Salesforce", "Folk", "Copper",
        "Neon", "Supabase", "Crunchy Data", "AWS RDS", "CockroachDB", "PlanetScale",
        "SGLang", "vLLM", "TensorRT-LLM", "Triton", "Ollama", "OpenTelemetry"
      ];
      for (const tech of knownTech) {
        const regex = new RegExp(`\\b${tech}\\b`, "i");
        if (regex.test(content)) {
          assertions.push({
            entity: tech,
            category: this.inferCategory(content),
            assertionType: "mention",
            assertionValue: `Referenced in document context`,
          });
        }
      }
    }

    return assertions;
  }

  private inferCategory(text: string): string {
    const lower = text.toLowerCase();
    if (lower.includes("crm") || lower.includes("sales") || lower.includes("pipeline") || lower.includes("lead")) {
      return "CRM";
    }
    if (lower.includes("postgres") || lower.includes("database") || lower.includes("sql") || lower.includes("hosting")) {
      return "Database";
    }
    if (lower.includes("llm") || lower.includes("gpu") || lower.includes("inference") || lower.includes("cuda")) {
      return "AI/ML Infrastructure";
    }
    return "General SaaS";
  }
}
