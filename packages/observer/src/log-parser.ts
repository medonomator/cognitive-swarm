import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { homedir } from 'node:os'

/** A single message from a Claude Code conversation. */
export interface ConversationMessage {
  readonly role: 'user' | 'assistant'
  readonly content: string
  readonly timestamp: string
  readonly model?: string
  readonly tokensUsed?: number
}

/** A parsed conversation session. */
export interface Conversation {
  readonly sessionId: string
  readonly project: string
  readonly messages: readonly ConversationMessage[]
  readonly startedAt: string
  readonly endedAt: string
  readonly totalTokens: number
  readonly filePath: string
}

/** Raw JSONL entry from Claude Code logs. */
interface RawLogEntry {
  readonly type?: string
  readonly uuid?: string
  readonly parentUuid?: string
  readonly sessionId?: string
  readonly timestamp?: string
  readonly cwd?: string
  readonly message?: {
    readonly role?: string
    readonly content?: string | readonly ContentBlock[]
    readonly model?: string
    readonly usage?: {
      readonly input_tokens?: number
      readonly output_tokens?: number
    }
  }
}

interface ContentBlock {
  readonly type: string
  readonly text?: string
}

const CLAUDE_DIR = join(homedir(), '.claude')
const PROJECTS_DIR = join(CLAUDE_DIR, 'projects')

/**
 * Extract text content from a message's content field.
 * Content can be a string or an array of content blocks.
 */
function extractText(
  content: string | readonly ContentBlock[] | undefined,
): string {
  if (!content) return ''
  if (typeof content === 'string') return content

  return content
    .filter((block): block is ContentBlock & { text: string } =>
      block.type === 'text' && typeof block.text === 'string',
    )
    .map((block) => block.text)
    .join('\n')
}

/**
 * Parse a single JSONL file into conversation messages.
 */
function parseJsonlFile(filePath: string): ConversationMessage[] {
  const raw = readFileSync(filePath, 'utf-8')
  const messages: ConversationMessage[] = []

  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue

    try {
      const entry = JSON.parse(trimmed) as RawLogEntry
      if (!entry.message?.role) continue

      const role = entry.message.role
      if (role !== 'user' && role !== 'assistant') continue

      const content = extractText(entry.message.content)
      if (!content.trim()) continue

      // Skip system-reminder noise and tool results
      if (content.startsWith('<system-reminder>')) continue
      if (content.length < 5) continue

      const tokens =
        (entry.message.usage?.input_tokens ?? 0) +
        (entry.message.usage?.output_tokens ?? 0)

      messages.push({
        role,
        content,
        timestamp: entry.timestamp ?? new Date().toISOString(),
        model: entry.message.model,
        tokensUsed: tokens || undefined,
      })
    } catch {
      // Skip malformed lines
    }
  }

  return messages
}

/**
 * Find all JSONL conversation files, optionally filtered by time.
 */
function findConversationFiles(
  sinceMs?: number,
): { path: string; mtime: number }[] {
  const results: { path: string; mtime: number }[] = []

  if (!existsSync(PROJECTS_DIR)) return results

  // Walk projects dir for session JSONL files
  for (const projectDir of readdirSync(PROJECTS_DIR)) {
    const projectPath = join(PROJECTS_DIR, projectDir)
    const stat = statSync(projectPath, { throwIfNoEntry: false })
    if (!stat?.isDirectory()) continue

    // Look for session directories containing JSONL files
    walkForJsonl(projectPath, results, sinceMs)
  }

  // Sort by modification time, newest first
  results.sort((a, b) => b.mtime - a.mtime)
  return results
}

function walkForJsonl(
  dir: string,
  results: { path: string; mtime: number }[],
  sinceMs?: number,
  depth = 0,
): void {
  if (depth > 4) return

  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return
  }

  for (const entry of entries) {
    const fullPath = join(dir, entry)
    const stat = statSync(fullPath, { throwIfNoEntry: false })
    if (!stat) continue

    if (stat.isDirectory()) {
      walkForJsonl(fullPath, results, sinceMs, depth + 1)
    } else if (entry.endsWith('.jsonl')) {
      if (sinceMs && stat.mtimeMs < sinceMs) continue
      // Skip subagent logs - noisy internal tool calls
      if (fullPath.includes('/subagents/')) continue
      results.push({ path: fullPath, mtime: stat.mtimeMs })
    }
  }
}

/**
 * Load conversations from the last N hours.
 */
export function loadRecentConversations(hours = 24): Conversation[] {
  const sinceMs = Date.now() - hours * 60 * 60 * 1000
  const files = findConversationFiles(sinceMs)
  const conversations: Conversation[] = []

  for (const file of files) {
    const messages = parseJsonlFile(file.path)
    if (messages.length < 2) continue // Need at least 1 exchange

    // Extract session ID from path
    const parts = file.path.split('/')
    const sessionId = parts.find((p) => p.match(/^[a-f0-9-]{36}$/)) ?? parts[parts.length - 1] ?? 'unknown'

    // Extract project from path
    const projectIdx = parts.indexOf('projects')
    const project = projectIdx >= 0 && parts[projectIdx + 1]
      ? parts[projectIdx + 1]!.replace(/-/g, '/')
      : 'unknown'

    const timestamps = messages
      .map((m) => m.timestamp)
      .filter(Boolean)
      .sort()

    const totalTokens = messages.reduce(
      (sum, m) => sum + (m.tokensUsed ?? 0),
      0,
    )

    conversations.push({
      sessionId,
      project,
      messages,
      startedAt: timestamps[0] ?? new Date().toISOString(),
      endedAt: timestamps[timestamps.length - 1] ?? new Date().toISOString(),
      totalTokens,
      filePath: file.path,
    })
  }

  return conversations
}

/**
 * Summarize a conversation into a compact text for swarm analysis.
 * Strips tool calls and keeps only meaningful exchanges.
 */
export function summarizeConversation(conv: Conversation): string {
  const lines: string[] = [
    `Session: ${conv.sessionId}`,
    `Project: ${conv.project}`,
    `Time: ${conv.startedAt} → ${conv.endedAt}`,
    `Messages: ${conv.messages.length}, Tokens: ${conv.totalTokens}`,
    '',
    '--- Conversation ---',
  ]

  for (const msg of conv.messages) {
    const prefix = msg.role === 'user' ? 'USER' : 'ASSISTANT'
    // Truncate very long messages to keep context manageable
    const content =
      msg.content.length > 800
        ? msg.content.slice(0, 800) + '... [truncated]'
        : msg.content

    lines.push(`\n[${prefix}]:\n${content}`)
  }

  return lines.join('\n')
}

/**
 * Get a brief overview of recent activity for the swarm task prompt.
 */
export function buildAnalysisTask(conversations: Conversation[]): string {
  // Filter out subagent conversations (short, noisy) and limit to top 5
  const mainConversations = conversations
    .filter((c) => c.messages.length >= 4)
    .slice(0, 15)

  const convSummaries = mainConversations
    .map((conv) => summarizeConversation(conv))
    .join('\n\n===================================\n\n')

  // Limit total size to ~15k chars to stay within embedding/context limits
  let trimmedSummaries = convSummaries
  if (trimmedSummaries.length > 15_000) {
    trimmedSummaries = trimmedSummaries.slice(0, 15_000) + '\n\n... [remaining conversations truncated]'
  }

  return `You are analyzing ${mainConversations.length} Claude Code sessions from the last 24 hours.

${trimmedSummaries}

DELIBERATE on these questions — there is no single correct answer, argue your perspective:

1. DECISIONS & CONTRADICTIONS: Which decisions made today might conflict with past decisions or established patterns? Should any be revisited? What trade-offs were implicit but not stated?

2. MISTAKES & SYSTEMIC ISSUES: Which errors indicate systemic problems vs one-off typos? What procedural rules should be extracted to prevent recurrence? Are any "fixes" actually masking deeper issues?

3. PRIORITIES & RISKS: Based on today's work, what should the user focus on next? What risks or blind spots are they ignoring? Is any work being over-invested or under-invested?

4. BEHAVIORAL PATTERNS: Are there recurring patterns (positive or negative) the user may not be aware of? Are there productivity anti-patterns? What knowledge was gained that should be preserved?

Challenge each other's interpretations. If you disagree with another agent's assessment, say why. Vote on what matters most.`
}
