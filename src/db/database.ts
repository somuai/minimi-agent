import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";

export interface DBMessage {
  id: string;
  conversation_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  created_at: number;
  tokens: number;
}

export interface DBEpisodicEntity {
  id: string;
  source_type: "message" | "file_upload";
  source_id: string;
  entity_name: string;
  entity_category: string;
  assertion_type: string;
  assertion_value: string;
  recorded_at: number;
}

export interface DBUploadedFile {
  id: string;
  filename: string;
  file_type: string;
  content: string;
  extracted_date: number;
  uploaded_at: number;
}

export interface DBSearchCache {
  query_hash: string;
  query_text: string;
  response_json: string;
  created_at: number;
  expires_at: number;
}

export class EpisodicDatabase {
  private db: Database.Database;

  constructor(dbPath?: string) {
    const targetPath = dbPath || process.env.DATABASE_PATH || "./data/chronos.db";
    const dir = path.dirname(targetPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    this.db = new Database(targetPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("synchronous = NORMAL");
    this.initializeSchema();
  }

  private initializeSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
        content TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        tokens INTEGER DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);
      CREATE INDEX IF NOT EXISTS idx_messages_conv_created ON messages(conversation_id, created_at);

      CREATE TABLE IF NOT EXISTS episodic_entities (
        id TEXT PRIMARY KEY,
        source_type TEXT NOT NULL CHECK(source_type IN ('message', 'file_upload')),
        source_id TEXT NOT NULL,
        entity_name TEXT NOT NULL,
        entity_category TEXT NOT NULL,
        assertion_type TEXT NOT NULL,
        assertion_value TEXT NOT NULL,
        recorded_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_entities_lookup ON episodic_entities(entity_name, recorded_at);
      CREATE INDEX IF NOT EXISTS idx_entities_recorded_at ON episodic_entities(recorded_at);

      CREATE TABLE IF NOT EXISTS uploaded_files (
        id TEXT PRIMARY KEY,
        filename TEXT NOT NULL,
        file_type TEXT NOT NULL,
        content TEXT NOT NULL,
        extracted_date INTEGER NOT NULL,
        uploaded_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_files_extracted_date ON uploaded_files(extracted_date);

      CREATE TABLE IF NOT EXISTS search_cache (
        query_hash TEXT PRIMARY KEY,
        query_text TEXT NOT NULL,
        response_json TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_search_cache_expiry ON search_cache(expires_at);
    `);
  }

  public getOrCreateConversation(id: string = "default", title: string = "Session"): string {
    const existing = this.db.prepare("SELECT id FROM conversations WHERE id = ?").get(id);
    if (!existing) {
      const now = Date.now();
      this.db
        .prepare("INSERT INTO conversations (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)")
        .run(id, title, now, now);
    }
    return id;
  }

  public saveMessage(
    conversationId: string,
    role: "user" | "assistant" | "system",
    content: string,
    createdAt: number = Date.now()
  ): string {
    this.getOrCreateConversation(conversationId);
    const id = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    this.db
      .prepare(
        "INSERT INTO messages (id, conversation_id, role, content, created_at, tokens) VALUES (?, ?, ?, ?, ?, ?)"
      )
      .run(id, conversationId, role, content, createdAt, Math.ceil(content.length / 4));
    return id;
  }

  public saveUploadedFile(
    filename: string,
    fileType: string,
    content: string,
    extractedDate: number
  ): string {
    const id = `file_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const now = Date.now();
    this.db
      .prepare(
        "INSERT INTO uploaded_files (id, filename, file_type, content, extracted_date, uploaded_at) VALUES (?, ?, ?, ?, ?, ?)"
      )
      .run(id, filename, fileType, content, extractedDate, now);
    return id;
  }

  public saveEntity(
    sourceType: "message" | "file_upload",
    sourceId: string,
    entityName: string,
    entityCategory: string,
    assertionType: string,
    assertionValue: string,
    recordedAt: number
  ): string {
    const id = `ent_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    this.db
      .prepare(
        `INSERT INTO episodic_entities 
        (id, source_type, source_id, entity_name, entity_category, assertion_type, assertion_value, recorded_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        sourceType,
        sourceId,
        entityName.toLowerCase().trim(),
        entityCategory,
        assertionType,
        assertionValue,
        recordedAt
      );
    return id;
  }

  public queryMessagesInInterval(startTs: number, endTs: number): DBMessage[] {
    return this.db
      .prepare("SELECT * FROM messages WHERE created_at BETWEEN ? AND ? ORDER BY created_at ASC")
      .all(startTs, endTs) as DBMessage[];
  }

  public queryEntitiesInInterval(startTs: number, endTs: number): DBEpisodicEntity[] {
    return this.db
      .prepare("SELECT * FROM episodic_entities WHERE recorded_at BETWEEN ? AND ? ORDER BY recorded_at ASC")
      .all(startTs, endTs) as DBEpisodicEntity[];
  }

  public queryEntitiesByName(names: string[]): DBEpisodicEntity[] {
    if (names.length === 0) return [];
    const placeholders = names.map(() => "?").join(",");
    const normalized = names.map((n) => n.toLowerCase().trim());
    return this.db
      .prepare(`SELECT * FROM episodic_entities WHERE entity_name IN (${placeholders}) ORDER BY recorded_at DESC`)
      .all(...normalized) as DBEpisodicEntity[];
  }

  public getAllEntities(): DBEpisodicEntity[] {
    return this.db
      .prepare("SELECT * FROM episodic_entities ORDER BY recorded_at DESC")
      .all() as DBEpisodicEntity[];
  }

  public getRecentMessages(limit: number = 20): DBMessage[] {
    return this.db
      .prepare("SELECT * FROM messages ORDER BY created_at DESC LIMIT ?")
      .all(limit)
      .reverse() as DBMessage[];
  }

  public getAllUploadedFiles(): DBUploadedFile[] {
    return this.db
      .prepare("SELECT * FROM uploaded_files ORDER BY uploaded_at DESC")
      .all() as DBUploadedFile[];
  }

  public getCachedSearch(queryHash: string): string | null {
    const row = this.db
      .prepare("SELECT response_json, expires_at FROM search_cache WHERE query_hash = ?")
      .get(queryHash) as { response_json: string; expires_at: number } | undefined;
    if (!row) return null;
    if (row.expires_at < Date.now()) {
      this.db.prepare("DELETE FROM search_cache WHERE query_hash = ?").run(queryHash);
      return null;
    }
    return row.response_json;
  }

  public setCachedSearch(
    queryHash: string,
    queryText: string,
    responseJson: string,
    ttlMs: number = 3600000
  ): void {
    const now = Date.now();
    this.db
      .prepare(
        `INSERT OR REPLACE INTO search_cache (query_hash, query_text, response_json, created_at, expires_at)
        VALUES (?, ?, ?, ?, ?)`
      )
      .run(queryHash, queryText, responseJson, now, now + ttlMs);
  }

  public close(): void {
    this.db.close();
  }
}
