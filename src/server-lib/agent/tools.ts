/**
 * Agent tool registry.
 *
 * Wave 4A ships ZERO tools — this file exists so the executor has a stable
 * shape to call into, and so Wave 4B can land concrete tools (read_files,
 * create_task, summarize_note, etc.) without touching the executor.
 */

export interface AgentToolContext {
  userId: string;
  aiGenerate: (prompt: string) => Promise<string>;
}

export interface AgentTool {
  name: string;
  description: string;
  run: (args: Record<string, unknown>, ctx: AgentToolContext) => Promise<string>;
}

/** Empty by design in Wave 4A. */
export const AGENT_TOOLS: ReadonlyArray<AgentTool> = [];

export function getTool(name: string): AgentTool | undefined {
  return AGENT_TOOLS.find((t) => t.name === name);
}
