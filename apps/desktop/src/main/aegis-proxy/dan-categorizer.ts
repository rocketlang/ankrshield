// SPDX-License-Identifier: AGPL-3.0-only
// ankrshield-desktop / aegis-proxy — DAN tool-category classifier (ASD-T-016)
//
// FR-10 / INF-ASD-008 define five HIGH categories that trigger a DAN gate:
//
//   file_write_outside_project_dir   — fs writes that escape the agent's CWD
//   shell_exec                       — arbitrary shell / process execution
//   network_egress_to_non_allowlisted_host — outbound HTTP/sockets the agent
//                                            can point anywhere
//   payment_api_call                 — money-moving APIs
//   database_ddl                     — schema-changing SQL (DROP/ALTER/CREATE)
//
// Tool calls are inspected at the request boundary by looking at the `tools`
// array the client declares in its request body. The agent has been granted
// access to these tools; HIGH-category access is what we gate on.
//
// Categorization is table-driven via tool-name regex + description keyword
// patterns. Unknown tools fall through to 'low' (no gate). Conservative
// over-classification preferred to under-classification.
//
// @rule:ASD-008 — HIGH categories require DAN gate human-in-loop
// @rule:INF-ASD-008 — categorization happens BEFORE forwarding upstream

export type DanCategory =
  | 'file_write_outside_project_dir'
  | 'shell_exec'
  | 'network_egress_to_non_allowlisted_host'
  | 'payment_api_call'
  | 'database_ddl'
  | 'low';

export const HIGH_CATEGORIES: ReadonlySet<DanCategory> = new Set<DanCategory>([
  'file_write_outside_project_dir',
  'shell_exec',
  'network_egress_to_non_allowlisted_host',
  'payment_api_call',
  'database_ddl',
]);

export interface ToolDeclaration {
  /** Tool name as declared by the agent (Anthropic: `name`; OpenAI: `function.name`). */
  name: string;
  /** Optional description text — used as secondary signal for categorization. */
  description?: string;
}

export interface CategorizedTool {
  name: string;
  category: DanCategory;
  /** Which rule pattern matched, for audit + debugging. */
  matchedBy: string;
}

interface CategoryRule {
  category: Exclude<DanCategory, 'low'>;
  /** Match against lowercased tool name. */
  namePatterns: RegExp[];
  /** Optional secondary match against lowercased description. */
  descPatterns?: RegExp[];
}

// Order matters: first match wins. Place stricter patterns first.
const RULES: readonly CategoryRule[] = [
  {
    category: 'shell_exec',
    namePatterns: [
      /\bbash\b/,
      /\bshell\b/,
      /\bexec(ute)?(_command|_shell)?\b/,
      /\brun_(command|shell|process|bash)\b/,
      /\bsubprocess\b/,
      /\bspawn(_process)?\b/,
      /\bsystem(_call|_exec)?\b/,
      /\bterminal\b/,
      /\bpowershell\b/,
      /\bcmd\b/,
    ],
    descPatterns: [/\bexecute.{0,30}(shell|command|process)\b/, /\barbitrary.{0,20}command\b/],
  },
  {
    category: 'database_ddl',
    namePatterns: [
      /\b(execute|run)_(sql|query|ddl)\b/,
      /\bsql_(exec|query|run|ddl)\b/,
      /\b(db|database)_(exec|query|run|ddl|migrate)\b/,
      /\bmigrate(_schema)?\b/,
      /\b(create|drop|alter|truncate)_(table|schema|database)\b/,
      /\bschema_(modify|change|alter)\b/,
    ],
    descPatterns: [
      /\b(drop|alter|create|truncate|rename)\b.{0,30}\b(table|schema|database|column)\b/,
      /\bschema.{0,20}(modify|change|migration)\b/,
    ],
  },
  {
    category: 'payment_api_call',
    namePatterns: [
      /\b(stripe|paypal|razorpay|paytm|squareup|braintree|adyen)_/,
      /\bcharge_card\b/,
      /\bcreate_(payment|charge|invoice|subscription|payout|transfer)\b/,
      /\bsend_(payment|money|funds)\b/,
      /\b(initiate|process)_(payment|transaction|refund)\b/,
      /\bpayout(_create)?\b/,
    ],
    descPatterns: [
      /\b(charge|move|transfer|send|withdraw|refund)\b.{0,30}\b(money|funds|payment|card)\b/,
    ],
  },
  {
    category: 'file_write_outside_project_dir',
    namePatterns: [
      /\bwrite_file\b/,
      /\bcreate_file\b/,
      /\bedit_file\b/,
      /\bappend_file\b/,
      /\boverwrite_file\b/,
      /\bfs_write\b/,
      /\bsave_file\b/,
      /\bdelete_file\b/,
      /\bremove_file\b/,
      /\bunlink\b/,
      /\bmkdir\b/,
      /\bchmod\b/,
    ],
    descPatterns: [
      /\bwrite\b.{0,30}\b(any|arbitrary|absolute)\b.{0,20}\bpath\b/,
      /\bmodify\b.{0,30}\bfilesystem\b/,
    ],
  },
  {
    category: 'network_egress_to_non_allowlisted_host',
    namePatterns: [
      /\bfetch(_url)?\b/,
      /\b(http_)?(get|post|put|patch|delete)_request\b/,
      /\bcurl\b/,
      /\bwget\b/,
      /\bweb_(request|fetch|browse|scrape)\b/,
      /\b(open_)?url(_open)?\b/,
      /\bsend_webhook\b/,
      /\b(tcp|udp|socket)_(open|connect|send)\b/,
    ],
    descPatterns: [
      /\b(make|send)\b.{0,30}\b(http|network|outbound)\b.{0,20}\b(request|call)\b/,
      /\bfetch\b.{0,30}\barbitrary\b.{0,20}\b(url|host)\b/,
    ],
  },
];

/**
 * Classify a single tool declaration. Returns 'low' if no rule matched
 * (unknown tools are not gated — operator must add a rule to upgrade).
 */
export function categorizeTool(tool: ToolDeclaration): CategorizedTool {
  const name = (tool.name ?? '').toLowerCase();
  const desc = (tool.description ?? '').toLowerCase();
  for (const rule of RULES) {
    for (const re of rule.namePatterns) {
      if (re.test(name))
        return { name: tool.name, category: rule.category, matchedBy: `name:${re.source}` };
    }
    if (rule.descPatterns) {
      for (const re of rule.descPatterns) {
        if (re.test(desc))
          return { name: tool.name, category: rule.category, matchedBy: `desc:${re.source}` };
      }
    }
  }
  return { name: tool.name, category: 'low', matchedBy: 'no-match' };
}

/**
 * Categorize an array of tool declarations. Returns ONLY tools that classified
 * into a HIGH category. Empty array → no DAN gate needed.
 */
export function categorizeHighRiskTools(tools: ToolDeclaration[]): CategorizedTool[] {
  const out: CategorizedTool[] = [];
  for (const t of tools) {
    const c = categorizeTool(t);
    if (c.category !== 'low') out.push(c);
  }
  return out;
}

/**
 * Extract tool declarations from a raw request body's parsed JSON. Handles
 * both Anthropic shape (`tools: [{name, description, input_schema}]`) and
 * OpenAI shape (`tools: [{type: 'function', function: {name, description}}]`).
 * Returns [] if the body has no tools (most non-agentic requests).
 */
export function extractToolDeclarations(rawJson: unknown): ToolDeclaration[] {
  if (!rawJson || typeof rawJson !== 'object') return [];
  const tools = (rawJson as { tools?: unknown }).tools;
  if (!Array.isArray(tools)) return [];
  const out: ToolDeclaration[] = [];
  for (const t of tools) {
    if (!t || typeof t !== 'object') continue;
    const obj = t as Record<string, unknown>;
    // OpenAI: { type: 'function', function: { name, description, parameters } }
    if (obj.type === 'function' && obj.function && typeof obj.function === 'object') {
      const fn = obj.function as Record<string, unknown>;
      if (typeof fn.name === 'string') {
        out.push({
          name: fn.name,
          description: typeof fn.description === 'string' ? fn.description : undefined,
        });
      }
      continue;
    }
    // Anthropic: { name, description, input_schema }
    if (typeof obj.name === 'string') {
      out.push({
        name: obj.name,
        description: typeof obj.description === 'string' ? obj.description : undefined,
      });
    }
  }
  return out;
}
