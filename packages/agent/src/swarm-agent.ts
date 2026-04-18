import type {
  Signal,
  SignalType,
  SwarmAgentConfig,
  ResolvedSwarmAgentConfig,
  AgentReaction,
  AgentStrategyId,
  AgentToolSupport,
  AgentToolResult,
  ProposalPayload,
  DiscoveryPayload,
  ChallengePayload,
  DoubtPayload,
  VotePayload,
  ToolResultPayload,
  ConsensusReachedPayload,
} from '@cognitive-swarm/core'
import type { CognitiveResponse } from '@cognitive-engine/core'
import { defaultErrorHandler, uid } from '@cognitive-engine/core'
import type { CognitiveOrchestrator } from '@cognitive-engine/orchestrator'
import type { ThompsonBandit } from '@cognitive-engine/bandit'
import { PersonalityFilter } from './personality-filter.js'

const DEFAULT_WEIGHT = 1
const DEFAULT_MAX_CONCURRENT = 1
const DEFAULT_REACTION_DELAY_MS = 0

const ALL_STRATEGIES: readonly AgentStrategyId[] = [
  'analyze',
  'propose',
  'challenge',
  'support',
  'synthesize',
  'defer',
]

const SIGNAL_TYPE_INDEX: ReadonlyMap<SignalType, number> = new Map([
  ['task:new', 0],
  ['discovery', 1],
  ['proposal', 2],
  ['doubt', 3],
  ['challenge', 4],
  ['vote', 5],
  ['conflict', 6],
  ['consensus:reached', 7],
  ['escalate', 8],
  ['memory:shared', 9],
  ['tool:result', 10],
])

const SIGNAL_TYPE_COUNT = SIGNAL_TYPE_INDEX.size

const STRATEGY_OUTPUT_TYPES: ReadonlyMap<
  AgentStrategyId,
  readonly SignalType[]
> = new Map([
  ['analyze', ['discovery']],
  ['propose', ['proposal']],
  ['challenge', ['challenge', 'doubt']],
  ['support', ['vote']],
  ['synthesize', ['proposal']],
  ['defer', []],
])

/**
 * A cognitive agent that participates in a swarm.
 * Wraps a CognitiveOrchestrator for reasoning and a ThompsonBandit
 * for strategy selection.
 *
 * Signal processing pipeline:
 * 1. shouldReact() - personality filter + type check
 * 2. selectStrategy() - bandit picks optimal strategy
 * 3. executeStrategy() - orchestrator processes and generates response
 * 4. buildOutputSignals() - map response to typed signals
 */
export class SwarmAgent {
  private readonly config: ResolvedSwarmAgentConfig
  private readonly orchestrator: CognitiveOrchestrator
  private readonly bandit: ThompsonBandit
  private readonly personalityFilter: PersonalityFilter
  private readonly toolSupport: AgentToolSupport | null
  private activeTasks = 0
  /** Signals seen in previous rounds — provides cross-round context. */
  private readonly signalHistory: Signal[] = []
  private static readonly MAX_HISTORY = 20

  constructor(
    orchestrator: CognitiveOrchestrator,
    bandit: ThompsonBandit,
    config: SwarmAgentConfig,
    toolSupport?: AgentToolSupport,
  ) {
    this.config = resolveConfig(config)
    this.orchestrator = orchestrator
    this.bandit = bandit
    this.toolSupport = toolSupport ?? null
    this.personalityFilter = new PersonalityFilter(
      this.config.personality,
    )
  }

  get id(): string {
    return this.config.id
  }

  get name(): string {
    return this.config.name
  }

  get role(): string {
    return this.config.role
  }

  get weight(): number {
    return this.config.weight
  }

  get listens(): readonly SignalType[] {
    return this.config.listens
  }

  get canEmit(): readonly SignalType[] {
    return this.config.canEmit
  }

  /** Check if this agent should react to a signal. */
  shouldReact(signal: Signal): boolean {
    if (signal.source === this.config.id) return false
    if (this.activeTasks >= this.config.maxConcurrentSignals) return false
    if (!this.config.listens.includes(signal.type)) return false
    return this.personalityFilter.shouldReact(signal)
  }

  /** Full signal processing pipeline. */
  async onSignal(signal: Signal): Promise<AgentReaction> {
    const start = Date.now()
    this.activeTasks++

    try {
      if (this.config.reactionDelayMs > 0) {
        await delay(this.config.reactionDelayMs)
      }

      const strategy = await this.selectStrategy(signal)
      const signals = await this.executeStrategy(signal, strategy)

      // Record signal for cross-round context
      this.signalHistory.push(signal)
      if (this.signalHistory.length > SwarmAgent.MAX_HISTORY) {
        this.signalHistory.splice(0, this.signalHistory.length - SwarmAgent.MAX_HISTORY)
      }

      return {
        agentId: this.config.id,
        inResponseTo: signal.id,
        signals,
        strategyUsed: strategy,
        processingTimeMs: Date.now() - start,
      }
    } catch (error: unknown) {
      this.config.onError(error, `agent.${this.config.id}.onSignal`)
      return {
        agentId: this.config.id,
        inResponseTo: signal.id,
        signals: [],
        strategyUsed: 'defer',
        processingTimeMs: Date.now() - start,
      }
    } finally {
      this.activeTasks--
    }
  }

  /** Record bandit feedback after consensus. */
  async recordFeedback(
    strategy: AgentStrategyId,
    context: number[],
    reward: number,
  ): Promise<void> {
    await this.bandit.update(strategy, context, reward)
  }

  /**
   * Record feedback using the actual signal that triggered the reaction.
   * Builds the correct context vector internally (same as selectStrategy uses).
   */
  async recordFeedbackForSignal(
    strategy: AgentStrategyId,
    signal: Signal,
    reward: number,
  ): Promise<void> {
    const context = this.buildContextVector(signal)
    await this.bandit.update(strategy, context, reward)
  }

  private async selectStrategy(
    signal: Signal,
  ): Promise<AgentStrategyId> {
    const context = this.buildContextVector(signal)
    const actions = [...this.config.strategyActions]
    const choice = await this.bandit.select(context, actions)
    return choice.actionId as AgentStrategyId
  }

  private buildContextVector(signal: Signal): number[] {
    const typeOneHot = encodeSignalType(signal.type)
    return [
      signal.confidence,
      this.config.personality.curiosity,
      this.config.personality.caution,
      this.config.personality.conformity,
      this.config.personality.verbosity,
      ...typeOneHot,
    ]
  }

  private async executeStrategy(
    signal: Signal,
    strategy: AgentStrategyId,
  ): Promise<readonly Signal[]> {
    if (strategy === 'defer') return []

    const basePrompt = this.buildPrompt(signal, strategy)

    if (!this.toolSupport || this.toolSupport.tools.length === 0) {
      const response = await this.orchestrator.process(
        this.config.id,
        basePrompt,
      )
      return this.buildOutputSignals(signal, strategy, response)
    }

    const prompt = this.toolSupport.promptInjector.inject(
      basePrompt,
      this.toolSupport.tools,
    )

    let response = await this.orchestrator.process(this.config.id, prompt)
    const toolSignals: Signal[] = []
    let remaining = this.toolSupport.maxToolCalls
    let text = response.suggestedResponse ?? ''

    while (remaining > 0) {
      const { toolCalls } = this.toolSupport.callParser.extract(text)
      if (toolCalls.length === 0) break

      const batch = toolCalls.slice(0, remaining)
      const results = await this.toolSupport.executor.executeAll(batch)
      remaining -= results.length

      for (const r of results) {
        toolSignals.push(buildToolResultSignal(this.config.id, signal.id, r))
      }

      const resultsText = formatToolResults(results)
      const followUp = `${basePrompt}\n\nTool results:\n${resultsText}\n\nContinue your analysis incorporating the tool results above.`
      response = await this.orchestrator.process(this.config.id, followUp)
      text = response.suggestedResponse ?? ''
    }

    const outputSignals = this.buildOutputSignals(signal, strategy, response)
    return [...toolSignals, ...outputSignals]
  }

  private buildPrompt(
    signal: Signal,
    strategy: AgentStrategyId,
  ): string {
    const payloadStr = JSON.stringify(signal.payload, null, 2)
    const roleCtx = `You are "${this.config.name}" with role: ${this.config.role}.`
    const historyCtx = this.buildHistoryContext(signal)

    switch (strategy) {
      case 'analyze':
        return `${roleCtx}${historyCtx}\nAnalyze this ${signal.type} signal:\n${payloadStr}\nProvide your analysis and any findings.`
      case 'propose':
        return `${roleCtx}${historyCtx}\nBased on this ${signal.type} signal:\n${payloadStr}\nPropose a solution or course of action.`
      case 'challenge':
        return `${roleCtx}${historyCtx}\nCritically examine this ${signal.type} signal:\n${payloadStr}\nIdentify weaknesses, risks, or alternative perspectives. Challenge assumptions and point out what others may have missed.`
      case 'support':
        return `${roleCtx}${historyCtx}\nEvaluate this ${signal.type} signal:\n${payloadStr}\nProvide supporting evidence or vote on the proposal.`
      case 'synthesize':
        return `${roleCtx}${historyCtx}\nSynthesize insights from this ${signal.type} signal:\n${payloadStr}\nCombine findings into a coherent proposal.`
      case 'defer':
        return ''
    }
  }

  /**
   * Build a concise summary of previous signals for cross-round context.
   * Agents can see what other agents said in prior rounds, enabling
   * meaningful challenges, building on discoveries, and avoiding duplication.
   */
  private buildHistoryContext(currentSignal: Signal): string {
    // Only include signals from OTHER agents (not self, not the current one)
    const relevant = this.signalHistory.filter(
      (s) => s.source !== this.config.id && s.id !== currentSignal.id,
    )
    if (relevant.length === 0) return ''

    const summaries = relevant.slice(-10).map((s) => {
      const content = summarizePayload(s.payload)
      return `  [${s.source}] ${s.type}: ${content}`
    })

    return `\n\nPREVIOUS SIGNALS from other agents (use as context, challenge if you disagree, build on if relevant):\n${summaries.join('\n')}\n`
  }

  private buildOutputSignals(
    original: Signal,
    strategy: AgentStrategyId,
    response: CognitiveResponse,
  ): Signal[] {
    const allowedOutputTypes =
      STRATEGY_OUTPUT_TYPES.get(strategy) ?? []
    let emittableTypes = allowedOutputTypes.filter((t) =>
      this.config.canEmit.includes(t),
    )

    // Fallback: if the strategy's output types aren't in canEmit,
    // remap to the closest allowed type instead of dropping the signal.
    // challenge/doubt → discovery (reframe as critical finding)
    // vote → discovery (reframe as evaluation)
    if (emittableTypes.length === 0 && allowedOutputTypes.length > 0) {
      const fallbackOrder: readonly SignalType[] = ['discovery', 'proposal', 'vote']
      const fallback = fallbackOrder.find((t) => this.config.canEmit.includes(t))
      if (fallback) {
        emittableTypes = [fallback]
      }
    }

    if (emittableTypes.length === 0) return []

    const outputType = emittableTypes[0]!
    const responseText =
      response.suggestedResponse ?? 'No response generated'
    const confidence =
      response.metacognition?.overallConfidence ?? original.confidence

    const payload = buildPayload(
      outputType,
      original,
      responseText,
      confidence,
    )

    const outputSignal: Signal = {
      id: uid('sig'),
      type: outputType,
      source: this.config.id,
      payload,
      confidence,
      timestamp: Date.now(),
      replyTo: original.id,
    }

    return [outputSignal]
  }
}

const DEFAULT_MAX_TOOL_CALLS = 3
const DEFAULT_TOOL_TIMEOUT_MS = 30_000

function resolveConfig(
  config: SwarmAgentConfig,
): ResolvedSwarmAgentConfig {
  return {
    id: config.id,
    name: config.name,
    role: config.role,
    personality: config.personality,
    listens: config.listens,
    canEmit: config.canEmit,
    weight: config.weight ?? DEFAULT_WEIGHT,
    maxConcurrentSignals:
      config.maxConcurrentSignals ?? DEFAULT_MAX_CONCURRENT,
    reactionDelayMs:
      config.reactionDelayMs ?? DEFAULT_REACTION_DELAY_MS,
    strategyActions: config.strategyActions ?? ALL_STRATEGIES,
    tools: config.tools
      ? {
          servers: config.tools.servers,
          maxToolCalls: config.tools.maxToolCalls ?? DEFAULT_MAX_TOOL_CALLS,
          toolTimeoutMs: config.tools.toolTimeoutMs ?? DEFAULT_TOOL_TIMEOUT_MS,
          personalityGating: config.tools.personalityGating ?? true,
        }
      : null,
    onError: config.onError ?? defaultErrorHandler,
  }
}

function encodeSignalType(type: SignalType): number[] {
  const vec = new Array<number>(SIGNAL_TYPE_COUNT).fill(0)
  const index = SIGNAL_TYPE_INDEX.get(type)
  if (index !== undefined) {
    vec[index] = 1
  }
  return vec
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function hasProposalId(
  payload: Signal['payload'],
): payload is ProposalPayload | VotePayload | ConsensusReachedPayload {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    'proposalId' in payload
  )
}

function extractProposalId(signal: Signal): string {
  if (hasProposalId(signal.payload)) {
    return signal.payload.proposalId
  }
  return signal.id
}

function buildPayload(
  type: SignalType,
  original: Signal,
  responseText: string,
  confidence: number,
): Signal['payload'] {
  switch (type) {
    case 'discovery':
      return {
        finding: responseText,
        relevance: Math.max(0.1, confidence),
      } satisfies DiscoveryPayload
    case 'proposal':
      return {
        proposalId: uid('prop'),
        content: responseText,
        reasoning: `In response to ${original.type} signal`,
      } satisfies ProposalPayload
    case 'challenge':
      return {
        targetSignalId: original.id,
        counterArgument: responseText,
      } satisfies ChallengePayload
    case 'doubt':
      return {
        targetSignalId: original.id,
        concern: responseText,
        severity: 'medium',
      } satisfies DoubtPayload
    case 'vote':
      return buildVotePayload(original, confidence)
    default:
      return {
        finding: responseText,
        relevance: 0.5,
      } satisfies DiscoveryPayload
  }
}

function buildToolResultSignal(
  agentId: string,
  triggeredBySignalId: string,
  result: AgentToolResult,
): Signal<'tool:result'> {
  return {
    id: uid('sig'),
    type: 'tool:result',
    source: agentId,
    payload: {
      toolName: result.toolName,
      result: typeof result.result === 'string'
        ? result.result
        : JSON.stringify(result.result),
      isError: result.isError,
      durationMs: result.durationMs,
      triggeredBy: triggeredBySignalId,
    } satisfies ToolResultPayload,
    confidence: result.isError ? 0.3 : 0.8,
    timestamp: Date.now(),
    replyTo: triggeredBySignalId,
  }
}

function formatToolResults(results: readonly AgentToolResult[]): string {
  return results
    .map((r) => {
      const status = r.isError ? 'ERROR' : 'OK'
      const value = typeof r.result === 'string'
        ? r.result
        : JSON.stringify(r.result)
      return `[${status}] ${r.toolName} (${r.durationMs}ms): ${value}`
    })
    .join('\n')
}

/** Extract a short text summary from a signal payload for history context. */
function summarizePayload(payload: Signal['payload']): string {
  // payload is always an object (SignalPayloadMap union)
  const p = payload as unknown as Record<string, unknown>

  // Try common payload fields in priority order
  const text =
    (typeof p['finding'] === 'string' ? p['finding'] : null) ??
    (typeof p['content'] === 'string' ? p['content'] : null) ??
    (typeof p['counterArgument'] === 'string' ? p['counterArgument'] : null) ??
    (typeof p['concern'] === 'string' ? p['concern'] : null) ??
    (typeof p['task'] === 'string' ? p['task'] : null) ??
    null

  if (text) return text.slice(0, 150)
  return JSON.stringify(payload).slice(0, 150)
}

/**
 * Build vote payload with dynamic stance based on confidence.
 *
 * High confidence (>0.6) -> agree
 * Low confidence (<0.3) -> disagree
 * Middle -> abstain
 *
 * Weight reflects how strongly the agent feels (distance from 0.5).
 */
function buildVotePayload(
  original: Signal,
  confidence: number,
): VotePayload {
  const proposalId = extractProposalId(original)

  let stance: 'agree' | 'disagree' | 'abstain'
  if (confidence >= 0.6) {
    stance = 'agree'
  } else if (confidence <= 0.3) {
    stance = 'disagree'
  } else {
    stance = 'abstain'
  }

  // Weight: how far from undecided (0.5). Range [0, 1].
  const weight = Math.min(1, Math.abs(confidence - 0.5) * 2)

  return { proposalId, stance, weight }
}
