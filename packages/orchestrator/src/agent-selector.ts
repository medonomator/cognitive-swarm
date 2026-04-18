import type { Signal, SwarmBanditStorage } from '@cognitive-swarm/core'
import type { SwarmAgent } from '@cognitive-swarm/agent'
import type { ContributionTracker } from './contribution-tracker.js'
import type { PredictionEngine } from './prediction-engine.js'

/** Configuration for selective agent activation. */
export interface AgentSelectionConfig {
  /** Max agents to activate per signal (default: all). */
  readonly topK?: number
  /** Min score spread to trigger selection. Below this, all agents activate. */
  readonly minSpread?: number
  /** Weight for bandit score component (0-1, default 0.35). */
  readonly banditWeight?: number
  /** Weight for contribution score component (0-1, default 0.35). */
  readonly contributionWeight?: number
  /** Weight for signal-type matching component (0-1, default 0.15). */
  readonly matchWeight?: number
  /** Weight for prediction surprise component (0-1, default 0.15). */
  readonly predictionWeight?: number
}

interface ResolvedSelectionConfig {
  readonly topK: number
  readonly minSpread: number
  readonly banditWeight: number
  readonly contributionWeight: number
  readonly matchWeight: number
  readonly predictionWeight: number
}

/**
 * Selects which agents should activate for a given signal.
 *
 * Uses four scoring components:
 * 1. Bandit score — historical success (mu mean from Thompson Bandit)
 * 2. Contribution score — recent usefulness (agree ratio from ContributionTracker)
 * 3. Match score — does the agent listen to this signal type?
 * 4. Prediction score — surprise from PredictionEngine (surprised agents get priority)
 *
 * When scores are too close (spread < minSpread), activates all agents
 * (exploration mode / cold start).
 */
export class AgentSelector {
  private readonly config: ResolvedSelectionConfig
  private readonly banditScoreCache = new Map<string, number>()
  private predictionEngine: PredictionEngine | null = null

  constructor(config?: AgentSelectionConfig) {
    this.config = {
      topK: config?.topK ?? Infinity,
      minSpread: config?.minSpread ?? 0.15,
      banditWeight: config?.banditWeight ?? 0.35,
      contributionWeight: config?.contributionWeight ?? 0.35,
      matchWeight: config?.matchWeight ?? 0.15,
      predictionWeight: config?.predictionWeight ?? 0.15,
    }
  }

  /** Set the prediction engine for surprise-based scoring. */
  setPredictionEngine(engine: PredictionEngine): void {
    this.predictionEngine = engine
  }

  /**
   * Load bandit scores from persistent storage.
   * Call once before solve() to populate the cache.
   */
  async loadBanditScores(storage: SwarmBanditStorage): Promise<void> {
    this.banditScoreCache.clear()
    const actionIds = await storage.listActionIds()
    for (const id of actionIds) {
      const params = await storage.getParams(id)
      if (params && params.mu.length > 0) {
        // Mean of mu vector as aggregate score (normalized to 0-1)
        const mean = params.mu.reduce((s, v) => s + v, 0) / params.mu.length
        this.banditScoreCache.set(id, sigmoid(mean))
      }
    }
  }

  /**
   * Select which agents should react to a signal.
   * Returns all agents if selection is not beneficial (cold start / low spread).
   */
  select(
    agents: readonly SwarmAgent[],
    signal: Signal,
    contributionTracker: ContributionTracker,
    disabledAgents?: ReadonlySet<string>,
  ): readonly SwarmAgent[] {
    // Filter to eligible agents first
    const eligible = agents.filter(a =>
      !disabledAgents?.has(a.id) && a.shouldReact(signal),
    )

    // If topK >= eligible count, no selection needed
    if (this.config.topK >= eligible.length) return eligible

    // Score each agent
    const scored = eligible.map(agent => ({
      agent,
      score: this.computeScore(agent, signal, contributionTracker),
    }))

    const scores = scored.map(s => s.score)
    const maxScore = Math.max(...scores)
    const minScore = Math.min(...scores)
    const spread = maxScore - minScore

    // Cold start / exploration: scores too close, activate all
    if (spread < this.config.minSpread) return eligible

    // Exploit: activate top K
    scored.sort((a, b) => b.score - a.score)
    return scored.slice(0, this.config.topK).map(s => s.agent)
  }

  private computeScore(
    agent: SwarmAgent,
    signal: Signal,
    contributionTracker: ContributionTracker,
  ): number {
    const banditScore = this.getBanditScore(agent.id)
    const contribScore = this.getContributionScore(agent.id, contributionTracker)
    const matchScore = agent.listens.includes(signal.type) ? 1.0 : 0.0
    const predictionScore = this.predictionEngine
      ? this.predictionEngine.getPredictionPriority(agent.id)
      : 0.5

    return (
      banditScore * this.config.banditWeight +
      contribScore * this.config.contributionWeight +
      matchScore * this.config.matchWeight +
      predictionScore * this.config.predictionWeight
    )
  }

  private getBanditScore(agentId: string): number {
    return this.banditScoreCache.get(agentId) ?? 0.5 // prior: uniform
  }

  private getContributionScore(
    agentId: string,
    tracker: ContributionTracker,
  ): number {
    const contributions = tracker.getContributions()
    const contrib = contributions.get(agentId)
    if (!contrib) return 0.5 // prior: neutral
    if (contrib.signalsEmitted === 0) return 0.5

    // avgConfidence as proxy for signal quality (higher = more useful)
    return Math.min(1.0, contrib.avgConfidence)
  }
}

/** Sigmoid to normalize unbounded bandit mu values to 0-1 range. */
function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x))
}
