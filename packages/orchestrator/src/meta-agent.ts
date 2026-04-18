import type { Signal, MathAnalysis, SwarmAdvice } from '@cognitive-swarm/core'
import type { LlmProvider } from '@cognitive-engine/core'
import { uid } from '@cognitive-engine/core'

/**
 * Meta-Agent — LLM-powered debate analyst.
 *
 * Sits above the swarm and observes debate patterns at a level
 * that rule-based checks cannot. Uses an LLM to:
 * - Detect when agents are talking past each other
 * - Identify overlooked angles or framings
 * - Recommend strategic interventions (reframe, synthesize, challenge)
 *
 * Runs every N rounds (configurable) to avoid excessive LLM cost.
 * Complements — not replaces — the rule-based SwarmAdvisor checks.
 *
 * Theoretical basis: Lesson 13 (Meta-Cognition), Lesson 17 (Orchestration).
 */

export interface MetaAgentConfig {
  /** LLM provider for meta-analysis (can be a different/cheaper model). */
  readonly llm: LlmProvider
  /** Run meta-analysis every N rounds (default: 3). */
  readonly analyzeEveryNRounds?: number
  /** Max signals to include in context (default: 30). Most recent are kept. */
  readonly maxContextSignals?: number
  /** Custom system prompt override. */
  readonly systemPrompt?: string
}

interface ResolvedMetaAgentConfig {
  readonly llm: LlmProvider
  readonly analyzeEveryNRounds: number
  readonly maxContextSignals: number
  readonly systemPrompt: string
}

const DEFAULT_SYSTEM_PROMPT = `You are a meta-cognitive analyst observing a multi-agent deliberation.

Your role is to identify patterns that individual agents cannot see:
- Are agents talking past each other (addressing different aspects of the problem)?
- Is the debate stuck in a local optimum or false dichotomy?
- Are there overlooked angles, framings, or dimensions?
- Is one agent's concern being systematically ignored despite being valid?

Based on your analysis, recommend ONE of these actions:
1. REFRAME: Suggest a new framing that bridges the divide
2. CHALLENGE: Point out a blind spot or overlooked dimension
3. SYNTHESIZE: Propose how competing views could be integrated
4. NONE: The debate is progressing well, no intervention needed

Respond in JSON format:
{
  "action": "REFRAME" | "CHALLENGE" | "SYNTHESIZE" | "NONE",
  "reasoning": "brief analysis of the debate state",
  "intervention": "the specific signal content to inject (if action != NONE)"
}`

interface MetaAgentResponse {
  action: 'REFRAME' | 'CHALLENGE' | 'SYNTHESIZE' | 'NONE'
  reasoning: string
  intervention?: string
}

export class MetaAgent {
  private readonly config: ResolvedMetaAgentConfig
  private roundsSinceLastAnalysis = 0
  private totalAnalyses = 0
  private totalInterventions = 0

  constructor(config: MetaAgentConfig) {
    this.config = {
      llm: config.llm,
      analyzeEveryNRounds: config.analyzeEveryNRounds ?? 3,
      maxContextSignals: config.maxContextSignals ?? 30,
      systemPrompt: config.systemPrompt ?? DEFAULT_SYSTEM_PROMPT,
    }
  }

  /**
   * Analyze the current debate state and optionally recommend an intervention.
   * Returns null if not time to analyze or if no intervention is needed.
   */
  async analyze(
    recentSignals: readonly Signal[],
    round: number,
    mathAnalysis: MathAnalysis,
  ): Promise<SwarmAdvice | null> {
    this.roundsSinceLastAnalysis++

    // Only analyze every N rounds
    if (this.roundsSinceLastAnalysis < this.config.analyzeEveryNRounds) {
      return null
    }

    this.roundsSinceLastAnalysis = 0
    this.totalAnalyses++

    const contextSignals = recentSignals.slice(-this.config.maxContextSignals)
    const prompt = this.buildAnalysisPrompt(contextSignals, round, mathAnalysis)

    try {
      const messages = [
        { role: 'system' as const, content: this.config.systemPrompt },
        { role: 'user' as const, content: prompt },
      ]

      const response = await this.config.llm.complete(messages)
      const parsed = this.parseResponse(response.content)

      if (!parsed || parsed.action === 'NONE') {
        return null
      }

      this.totalInterventions++
      return this.toAdvice(parsed, round)
    } catch {
      // LLM failure is non-critical — degrade gracefully
      return null
    }
  }

  /** Reset state for a new solve. */
  reset(): void {
    this.roundsSinceLastAnalysis = 0
  }

  /** Stats for the advisor report. */
  getStats(): { analyses: number; interventions: number } {
    return {
      analyses: this.totalAnalyses,
      interventions: this.totalInterventions,
    }
  }

  private buildAnalysisPrompt(
    signals: readonly Signal[],
    round: number,
    mathAnalysis: MathAnalysis,
  ): string {
    const lines: string[] = [`Round: ${round}`, '']

    // Signal summary
    lines.push('=== RECENT SIGNALS ===')
    for (const s of signals) {
      const payloadStr = typeof s.payload === 'object' && s.payload !== null
        ? JSON.stringify(s.payload).slice(0, 200)
        : String(s.payload)
      lines.push(`[${s.type}] ${s.source} (conf: ${s.confidence.toFixed(2)}): ${payloadStr}`)
    }

    // Math insights summary
    lines.push('', '=== MATH ANALYSIS ===')

    if (mathAnalysis.entropy) {
      lines.push(`Entropy: ${mathAnalysis.entropy.final.toFixed(3)} (normalized: ${mathAnalysis.entropy.normalized.toFixed(2)})`)
    }

    if (mathAnalysis.bayesian?.mapEstimate) {
      const map = mathAnalysis.bayesian.mapEstimate
      lines.push(`Bayesian MAP: proposal ${map.proposalId} (probability: ${map.probability.toFixed(3)})`)
    }

    if (mathAnalysis.gameTheory) {
      lines.push(`Game theory: groupthink risk = ${mathAnalysis.gameTheory.groupthinkRisk}`)
    }

    if (mathAnalysis.beliefDistance && mathAnalysis.beliefDistance.clusterCount >= 2) {
      lines.push(`Belief clusters: ${mathAnalysis.beliefDistance.clusterCount} (mean distance: ${mathAnalysis.beliefDistance.meanDistance.toFixed(2)})`)
    }

    if (mathAnalysis.svd?.oneDimensional) {
      lines.push(`SVD: debate is 1-dimensional (effective rank: ${mathAnalysis.svd.effectiveRank})`)
    }

    return lines.join('\n')
  }

  private parseResponse(content: string): MetaAgentResponse | null {
    try {
      // Extract JSON from potential markdown code blocks
      const jsonMatch = content.match(/\{[\s\S]*\}/)
      if (!jsonMatch) return null

      const parsed: Record<string, unknown> = JSON.parse(jsonMatch[0])

      const action = String(parsed['action'] ?? '')
      if (!isValidAction(action)) return null

      return {
        action,
        reasoning: String(parsed['reasoning'] ?? ''),
        intervention: parsed['intervention'] ? String(parsed['intervention']) : undefined,
      }
    } catch {
      return null
    }
  }

  private toAdvice(response: MetaAgentResponse, round: number): SwarmAdvice {
    const content = response.intervention ?? response.reasoning

    if (response.action === 'CHALLENGE') {
      const signal: Signal<'challenge'> = {
        id: uid('sig'),
        type: 'challenge',
        source: 'meta-agent',
        payload: {
          targetSignalId: 'debate',
          counterArgument: content,
        },
        confidence: 0.75,
        timestamp: Date.now(),
        metadata: { round, causalLevel: 'counterfactual' },
      }
      return {
        type: 'inject-signal',
        signal,
        reason: `Meta-agent challenge (round ${round}): ${response.reasoning.slice(0, 100)}`,
      }
    }

    if (response.action === 'REFRAME') {
      const signal: Signal<'discovery'> = {
        id: uid('sig'),
        type: 'discovery',
        source: 'meta-agent',
        payload: {
          finding: content,
          relevance: 0.9,
        },
        confidence: 0.7,
        timestamp: Date.now(),
        metadata: { round, causalLevel: 'intervention' },
      }
      return {
        type: 'inject-signal',
        signal,
        reason: `Meta-agent reframe (round ${round}): ${response.reasoning.slice(0, 100)}`,
      }
    }

    // SYNTHESIZE
    const signal: Signal<'proposal'> = {
      id: uid('sig'),
      type: 'proposal',
      source: 'meta-agent',
      payload: {
        proposalId: uid('prop'),
        content,
        reasoning: `Meta-agent synthesis: ${response.reasoning}`,
      },
      confidence: 0.65,
      timestamp: Date.now(),
      metadata: { round, causalLevel: 'intervention' },
    }
    return {
      type: 'inject-signal',
      signal,
      reason: `Meta-agent synthesis (round ${round}): ${response.reasoning.slice(0, 100)}`,
    }
  }
}

const VALID_ACTIONS: ReadonlySet<string> = new Set(['REFRAME', 'CHALLENGE', 'SYNTHESIZE', 'NONE'])

function isValidAction(value: string): value is MetaAgentResponse['action'] {
  return VALID_ACTIONS.has(value)
}
