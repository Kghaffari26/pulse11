import { queryInternalDatabase } from "@/server-lib/internal-db-query";
import {
  CHAT_HISTORY_LIMIT,
  CHAT_PAGE_DEFAULT,
  CHAT_PAGE_MAX,
  type ChatContextUsed,
  type ChatMessage,
  type ChatRole,
} from "@/shared/models/chat";

function rowToMessage(row: Record<string, unknown>): ChatMessage {
  return {
    id: row.id as string,
    projectId: row.project_id as string,
    userEmail: row.user_email as string,
    role: row.role as ChatRole,
    content: row.content as string,
    contextUsed: (row.context_used as ChatContextUsed | null) ?? null,
    createdAt: new Date(row.created_at as string).toISOString(),
  };
}

export interface ChatStore {
  insert(input: {
    projectId: string;
    userEmail: string;
    role: ChatRole;
    content: string;
    contextUsed?: ChatContextUsed | null;
  }): Promise<ChatMessage>;

  /** Returns the last N messages, oldest first — used to build prompt context. */
  recent(projectId: string, userEmail: string, limit?: number): Promise<ChatMessage[]>;

  /** Paginated history for the UI. Returns oldest-first. `before` is a message ID cursor. */
  page(opts: {
    projectId: string;
    userEmail: string;
    limit?: number;
    before?: string | null;
  }): Promise<ChatMessage[]>;

  /** Hard delete every message in this project for this user. Returns count deleted. */
  clear(projectId: string, userEmail: string): Promise<number>;
}

export const defaultChatStore: ChatStore = {
  async insert({ projectId, userEmail, role, content, contextUsed }) {
    const rows = await queryInternalDatabase(
      `INSERT INTO vybe_project_chat_messages (project_id, user_email, role, content, context_used)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [projectId, userEmail, role, content, contextUsed ? JSON.stringify(contextUsed) : null],
    );
    return rowToMessage(rows[0] as Record<string, unknown>);
  },

  async recent(projectId, userEmail, limit = CHAT_HISTORY_LIMIT) {
    const rows = await queryInternalDatabase(
      `SELECT * FROM (
         SELECT * FROM vybe_project_chat_messages
         WHERE project_id = $1 AND user_email = $2
         ORDER BY created_at DESC
         LIMIT $3
       ) sub
       ORDER BY created_at ASC`,
      [projectId, userEmail, limit],
    );
    return rows.map((r) => rowToMessage(r as Record<string, unknown>));
  },

  async page({ projectId, userEmail, limit = CHAT_PAGE_DEFAULT, before }) {
    const lim = Math.min(Math.max(1, limit), CHAT_PAGE_MAX);
    const rows = before
      ? await queryInternalDatabase(
          `SELECT * FROM (
             SELECT * FROM vybe_project_chat_messages
             WHERE project_id = $1 AND user_email = $2
               AND created_at < (
                 SELECT created_at FROM vybe_project_chat_messages
                 WHERE id = $3 AND project_id = $1 AND user_email = $2
               )
             ORDER BY created_at DESC
             LIMIT $4
           ) sub
           ORDER BY created_at ASC`,
          [projectId, userEmail, before, lim],
        )
      : await queryInternalDatabase(
          `SELECT * FROM (
             SELECT * FROM vybe_project_chat_messages
             WHERE project_id = $1 AND user_email = $2
             ORDER BY created_at DESC
             LIMIT $3
           ) sub
           ORDER BY created_at ASC`,
          [projectId, userEmail, lim],
        );
    return rows.map((r) => rowToMessage(r as Record<string, unknown>));
  },

  async clear(projectId, userEmail) {
    const rows = await queryInternalDatabase(
      `DELETE FROM vybe_project_chat_messages
       WHERE project_id = $1 AND user_email = $2
       RETURNING id`,
      [projectId, userEmail],
    );
    return rows.length;
  },
};
