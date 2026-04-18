/**
 * EvolutionController — mid-solve agent spawning and dissolution.
 *
 * Follows the SwarmAdvisor pattern: evaluateRound() → actions.
 * The orchestrator applies actions (spawn/dissolve) to the agent pool.
 *
 * Guardrails:
 *   - Hard cap on evolved agents (maxEvolvedAgents)
 *   - Domain cooldowns prevent re-spawning dissolved domains
 *   - High urgency threshold (>= 0.6) prevents frivolous spawns
 *   - Confirmation requirement (2+ signals) prevents single-source gaps
 *   - Evaluation window before dissolution
 *   - NMI pruning for redundant agents (max 1 per round)
 */

import { SwarmEvolver, type GapSignal, type SpawnProposal } from '@cognitive-swarm/evolution'
import type {
  ResolvedEvolutionConfig,
  MathAnalysis,
  AgentContribution,
  PersonalityVector,
  SignalType,
  EvolutionSpawnEntry,
  EvolutionDissolveEntry,
  EvolutionReport,
} from '@cognitive-swarm/core'
import { uid } from '@cognitive-engine/core'

// ── Public types ────────────────────────────────────────────────

export type EvolutionAction =
  | { readonly type: 'spawn'; readonly proposal: SpawnProposal; readonly domain: string }
  | { readonly type: 'dissolve'; readonly agentId: string; readonly reason: string }

// ── Domain personality presets ──────────────────────────────────

interface DomainPreset {
  readonly personality: PersonalityVector
  readonly canEmit: readonly SignalType[]
}

const DOMAIN_PRESETS: Readonly<Record<string, DomainPreset>> = {
  'critical-challenger': {
    personality: { curiosity: 0.8, caution: 0.3, conformity: 0.1, verbosity: 0.6 },
    canEmit: ['challenge', 'doubt', 'discovery', 'vote'],
  },
  'lateral-thinker': {
    personality: { curiosity: 0.9, caution: 0.4, conformity: 0.2, verbosity: 0.5 },
    canEmit: ['discovery', 'proposal', 'challenge'],
  },
  'vote-specialist': {
    personality: { curiosity: 0.4, caution: 0.6, conformity: 0.8, verbosity: 0.3 },
    canEmit: ['vote', 'discovery'],
  },
  'bridge-connector': {
    personality: { curiosity: 0.6, caution: 0.5, conformity: 0.5, verbosity: 0.7 },
    canEmit: ['discovery', 'proposal', 'vote'],
  },
  'active-contributor': {
    personality: { curiosity: 0.7, caution: 0.4, conformity: 0.4, verbosity: 0.6 },
    canEmit: ['discovery', 'proposal', 'challenge', 'vote'],
  },
  'discovery-specialist': {
    personality: { curiosity: 0.9, caution: 0.3, conformity: 0.2, verbosity: 0.5 },
    canEmit: ['discovery', 'proposal', 'challenge'],
  },
}

const DEFAULT_PRESET: DomainPreset = {
  personality: { curiosity: 0.7, caution: 0.5, conformity: 0.3, verbosity: 0.5 },
  canEmit: ['discovery', 'proposal', 'challenge', 'vote'],
}

// ── Gap detection thresholds ────────────────────────────────────

const MIN_URGENCY_FOR_SPAWN = 0.6
const REPLICATOR_MAGNITUDE_THRESHOLD = 0.7
const STAGNATION_INFO_GAIN_THRESHOLD = 0.01
const STAGNATION_ENTROPY_THRESHOLD = 0.7
const SILENT_AGENT_THRESHOLD = 3

// ── Controller ──────────────────────────────────────────────────

export class EvolutionController {
  private readonly config: ResolvedEvolutionConfig
  private readonly evolver: SwarmEvolver
  private readonly spawnedAgentIds = new Set<string>()
  private readonly spawnedDomains = new Map<string, string>() // domain → agentId
  private readonly spawnRounds = new Map<string, number>()     // agentId → round spawned
  private readonly domainCooldowns = new Map<string, number>() // domain → rounds remaining
  private readonly pendingGaps = new Map<string, { gap: GapSignal; confirmations: number }>()

  private readonly spawnLog: EvolutionSpawnEntry[] = []
  private readonly dissolveLog: EvolutionDissolveEntry[] = []

  constructor(config: ResolvedEvolutionConfig) {
    this.config = config
    this.evolver = new SwarmEvolver(undefined as never, {
      minVotesForSpawn: 2,
      approvalThreshold: 0.6,
      minValueForKeep: config.minValueForKeep,
      evaluationWindow: config.evaluationWindow,
    })
  }

  /**
   * Evaluate the current round and produce evolution actions.
   *
   * Called after mathBridge.processRound() + advisor in the solve loop.
   */
  evaluateRound(
    round: number,
    mathAnalysis: MathAnalysis,
    contributions: ReadonlyMap<string, AgentContribution>,
    existingAgentIds: readonly string[],
  ): readonly EvolutionAction[] {
    const actions: EvolutionAction[] = []

    // 1. Tick cooldowns
    this.tickCooldowns()

    // 2. Detect gaps from math analysis
    this.detectGaps(mathAnalysis, contributions, existingAgentIds)

    // 3. Attempt spawns for confirmed gaps
    const spawnActions = this.processSpawns(round)
    actions.push(...spawnActions)

    // 4. Evaluate spawned agents for dissolution
    const dissolveActions = this.evaluateSpawned(round, contributions)
    actions.push(...dissolveActions)

    // 5. NMI pruning
    const pruneActions = this.nmiPrune(mathAnalysis, round)
    actions.push(...pruneActions)

    return actions
  }

  /** Get evolution report for SwarmResult. */
  getReport(): EvolutionReport {
    return {
      spawned: this.spawnLog,
      dissolved: this.dissolveLog,
      activeEvolvedCount: this.spawnedAgentIds.size,
    }
  }

  /** Reset for a new solve. */
  reset(): void {
    this.spawnedAgentIds.clear()
    this.spawnedDomains.clear()
    this.spawnRounds.clear()
    this.domainCooldowns.clear()
    this.pendingGaps.clear()
    this.spawnLog.length = 0
    this.dissolveLog.length = 0
  }

  /** Get IDs of all currently active evolved agents. */
  get activeEvolvedIds(): ReadonlySet<string> {
    return this.spawnedAgentIds
  }

  // ── Gap Detection ─────────────────────────────────────────────

  private detectGaps(
    math: MathAnalysis,
    contributions: ReadonlyMap<string, AgentContribution>,
    _existingAgentIds: readonly string[],
  ): void {
    // Game theory: no challengers + high groupthink risk
    if (math.gameTheory) {
      if (math.gameTheory.actualChallengers === 0 && math.gameTheory.groupthinkRisk === 'high') {
        this.reportGap('critical-challenger', 'No challengers, consensus unchecked', 0.9)
      }
    }

    // Replicator dynamics: large strategy shift
    if (math.replicatorDynamics) {
      for (const shift of math.replicatorDynamics.suggestedShifts) {
        if (shift.magnitude > REPLICATOR_MAGNITUDE_THRESHOLD && shift.direction === 'increase') {
          this.reportGap(`${shift.strategy}-specialist`, 'Underrepresented strategy', 0.6)
        }
      }
    }

    // Influence graph: isolated agents
    if (math.influence) {
      if (math.influence.isolatedAgents.length > 0) {
        this.reportGap('bridge-connector', 'Isolated agents need bridging', 0.5)
      }
    }

    // Stagnation: low info gain + high entropy
    if (
      math.informationGain.perRound < STAGNATION_INFO_GAIN_THRESHOLD &&
      math.entropy.normalized > STAGNATION_ENTROPY_THRESHOLD
    ) {
      this.reportGap('lateral-thinker', 'Swarm stagnating with mixed perspectives', 0.7)
    }

    // Silent agents: too many nearly-silent participants
    let silentCount = 0
    for (const contrib of contributions.values()) {
      if (contrib.proposalsMade === 0 && contrib.signalsEmitted <= 1) {
        silentCount++
      }
    }
    if (silentCount >= SILENT_AGENT_THRESHOLD) {
      this.reportGap('active-contributor', `${silentCount} nearly-silent agents`, 0.4)
    }

    // Proposal Energy: rising alternative ignored by Bayesian MAP
    // If a proposal has strong positive momentum but isn't the MAP leader,
    // the swarm may be overlooking a dark horse — spawn a champion for it.
    if (math.proposalEnergy && math.bayesian.mapEstimate) {
      const rising = math.proposalEnergy.risingFastest
      if (rising && rising !== math.bayesian.mapEstimate.proposalId && rising !== math.proposalEnergy.leader) {
        this.reportGap('lateral-thinker', `Proposal "${rising}" gaining momentum but not leading — may need advocacy`, 0.6)
      }
    }

    // Projection Consensus: disagreement with Bayesian MAP
    // If weighted least-squares consensus points to a different winner than
    // Bayesian MAP, the voting weights reveal a hidden preference structure.
    if (math.projectionConsensus && math.bayesian.mapEstimate) {
      const projEntries = Object.entries(math.projectionConsensus.consensus)
      if (projEntries.length > 0) {
        const projLeader = projEntries.reduce((a, b) => a[1] > b[1] ? a : b)
        if (projLeader[0] !== math.bayesian.mapEstimate.proposalId && !math.projectionConsensus.tight) {
          this.reportGap('lateral-thinker', `Projection consensus favors "${projLeader[0]}" over MAP "${math.bayesian.mapEstimate.proposalId}" — weight structure disagrees with likelihood`, 0.7)
        }
      }
    }
  }

  private reportGap(domain: string, reason: string, urgency: number): void {
    // Skip if domain already active or in cooldown
    if (this.spawnedDomains.has(domain)) return
    if (this.domainCooldowns.has(domain)) return

    // Skip if urgency too low
    if (urgency < MIN_URGENCY_FOR_SPAWN) return

    const existing = this.pendingGaps.get(domain)
    if (existing) {
      // Increment confirmations
      existing.confirmations++
    } else {
      const gap: GapSignal = {
        id: uid('gap'),
        detectedBy: 'evolution-controller',
        domain,
        reason,
        urgency,
        timestamp: Date.now(),
      }
      this.pendingGaps.set(domain, { gap, confirmations: 1 })
    }
  }

  // ── Spawning ──────────────────────────────────────────────────

  private processSpawns(round: number): EvolutionAction[] {
    const actions: EvolutionAction[] = []

    for (const [domain, entry] of this.pendingGaps) {
      // Check all gates
      if (this.spawnedAgentIds.size >= this.config.maxEvolvedAgents) break
      if (entry.confirmations < 2) continue
      if (this.spawnedDomains.has(domain)) continue
      if (this.domainCooldowns.has(domain)) continue

      // Create spawn proposal with domain preset
      const preset = DOMAIN_PRESETS[domain] ?? DEFAULT_PRESET
      const agentId = uid('evolved')
      const proposal: SpawnProposal = {
        id: `spawn-${entry.gap.id}`,
        gapId: entry.gap.id,
        role: domain,
        roleDescription: entry.gap.reason,
        personality: preset.personality,
        listens: ['task:new', 'discovery', 'challenge'] as SignalType[],
        canEmit: [...preset.canEmit],
        temporary: entry.gap.urgency < 0.5,
        proposedBy: ['evolution-controller'],
        votes: [],
        status: 'approved' as const,
      }

      this.spawnedAgentIds.add(agentId)
      this.spawnedDomains.set(domain, agentId)
      this.spawnRounds.set(agentId, round)
      this.spawnLog.push({ agentId, domain, round, reason: entry.gap.reason })
      this.pendingGaps.delete(domain)

      actions.push({ type: 'spawn', proposal, domain })
    }

    return actions
  }

  // ── Evaluation & Dissolution ──────────────────────────────────

  private evaluateSpawned(
    round: number,
    contributions: ReadonlyMap<string, AgentContribution>,
  ): EvolutionAction[] {
    const actions: EvolutionAction[] = []

    for (const agentId of this.spawnedAgentIds) {
      const spawnRound = this.spawnRounds.get(agentId) ?? 0
      const roundsActive = round - spawnRound

      // Don't evaluate before window
      if (roundsActive < this.config.evaluationWindow) continue

      const contrib = contributions.get(agentId)
      const signalsSent = contrib?.signalsEmitted ?? 0
      const proposalsMade = contrib?.proposalsMade ?? 0

      const result = this.evolver.evaluate(agentId, signalsSent, proposalsMade, roundsActive)

      if (result.recommendation === 'dissolve') {
        this.dissolveAgent(agentId, round, result.reason)
        actions.push({ type: 'dissolve', agentId, reason: result.reason })
      }
    }

    return actions
  }

  // ── NMI Pruning ───────────────────────────────────────────────

  private nmiPrune(math: MathAnalysis, round: number): EvolutionAction[] {
    if (!math.redundancy) return []
    if (math.redundancy.averageNMI < this.config.nmiPruneThreshold) return []

    // Only prune evolved agents
    const candidates = math.redundancy.redundantAgents
      .filter(id => this.spawnedAgentIds.has(id))

    if (candidates.length === 0) return []

    // Prune at most 1 per round — the first candidate (lowest Shapley typically)
    const agentId = candidates[0]!
    this.dissolveAgent(agentId, round, `Redundant (NMI > ${this.config.nmiPruneThreshold})`)

    return [{ type: 'dissolve', agentId, reason: `Redundant (NMI > ${this.config.nmiPruneThreshold})` }]
  }

  // ── Shared helpers ────────────────────────────────────────────

  private dissolveAgent(agentId: string, round: number, reason: string): void {
    // Find domain for cooldown
    for (const [domain, id] of this.spawnedDomains) {
      if (id === agentId) {
        this.domainCooldowns.set(domain, this.config.cooldownRounds)
        this.spawnedDomains.delete(domain)
        break
      }
    }

    this.spawnedAgentIds.delete(agentId)
    this.spawnRounds.delete(agentId)
    this.dissolveLog.push({ agentId, round, reason })
  }

  private tickCooldowns(): void {
    for (const [domain, remaining] of this.domainCooldowns) {
      if (remaining <= 1) {
        this.domainCooldowns.delete(domain)
      } else {
        this.domainCooldowns.set(domain, remaining - 1)
      }
    }
  }
}
