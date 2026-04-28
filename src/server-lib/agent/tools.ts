/**
 * Agent tool registry.
 *
 * Wave 4B-2 wires the executor to dispatch tool calls when a planned step
 * carries a `tool` field. Concrete tools live under ./tools/* and register
 * themselves into AGENT_TOOLS.
 */

import { aiGenerate } from "@/server-lib/ai-generate";

import { extractTasksTool } from "./tools/extract-tasks";
import { summarizeFileTool } from "./tools/summarize-file";
import { generateStudyPlanTool } from "./tools/generate-study-plan";

export interface AgentToolContext {
  userId: string;
  /** Project id available when the job context carried one. Tools that
   *  require project scope (all three Wave 4B-2 tools) error if absent. */
  projectId?: string;
  /** Pre-bound aiGenerate so tools never need to plumb userId through prompts. */
  aiGenerate: (prompt: string) => Promise<string>;
}

export interface AgentTool {
  name: string;
  description: string;
  run: (args: Record<string, unknown>, ctx: AgentToolContext) => Promise<string>;
}

export const AGENT_TOOLS: ReadonlyArray<AgentTool> = [
  extractTasksTool,
  summarizeFileTool,
  generateStudyPlanTool,
];

export function getTool(name: string): AgentTool | undefined {
  return AGENT_TOOLS.find((t) => t.name === name);
}

/** Default aiGenerate wrapper bound to a userId — tools call this to keep
 *  every model call routed through the BYOK + free-tier policy. */
export function makeBoundAiGenerate(userId: string): (prompt: string) => Promise<string> {
  return async (prompt: string) => {
    const r = await aiGenerate({ userId, prompt });
    if (!r.ok) throw new Error(r.error);
    return r.text;
  };
}
