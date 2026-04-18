import type {
  Signal,
  ProposalPayload,
  VotePayload,
  DiscoveryPayload,
  ChallengePayload,
  SwarmConfig,
  ResolvedSwarmConfig,
  SwarmResult,
  SwarmEvent,
  SwarmEventMap,
  DebateResult,
  ConsensusResult,
  Proposal,
  VoteRecord,
  ResolvedMathConfig,
  AgentReaction,
  SwarmControlSignals,
} from '@cognitive-swarm/core'
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { TypedEventEmitter } from '@cognitive-swarm/core'
import type { ErrorHandler, EngineConfig } from '@cognitive-engine/core'
import { defaultErrorHandler, uid } from '@cognitive-engine/core'
import { CognitiveOrchestrator } from '@cognitive-engine/orchestrator'
import { ThompsonBandit, MemoryBanditStorage } from '@cognitive-engine/bandit'
import { SwarmAgent } from '@cognitive-swarm/agent'
import { SignalBus } from '@cognitive-swarm/signals'
import { ConsensusEngine } from '@cognitive-swarm/consensus'
import { TokenTrackingLlmProvider } from './token-tracker.js'
import { ResilientLlmProvider } from './resilient-llm-provider.js'
import { ContributionTracker } from './contribution-tracker.js'
import { RoundRunner } from './round-runner.js'
import { Synthesizer } from './synthesizer.js'
import { MathBridge } from './math-bridge.js'
import { SwarmAdvisor } from './swarm-advisor.js'
import { DebateRunner, DEFAULT_CONVERGENCE_THRESHOLD } from './debate-runner.js'
import { AgentSelector } from './agent-selector.js'
import { EvolutionController, type EvolutionAction } from './evolution-controller.js'
import { CalibrationTracker } from './calibration-tracker.js'
import { GlobalWorkspace } from './global-workspace.js'
import { PredictionEngine } from './prediction-engine.js'

const DEFAULT_MAX_ROUNDS = 10
const DEFAULT_MAX_SIGNALS = 200
const DEFAULT_TIMEOUT_MS = 120_000
const COST_PER_TOKEN_USD = 0.000003

/**
 * Orchestrates a swarm of cognitive agents to solve a task.
 *
 * Creates agents from SwarmAgentDef[], runs a round-based solve loop,
 * checks consensus, and optionally synthesizes a final answer.
 *
 * Usage:
 * ```ts
 * const orchestrator = new SwarmOrchestrator(config)
 * const result = await orchestrator.solve('What is the best approach?')
 * ```
 */
export class SwarmOrchestrator {
  private readonly config: ResolvedSwarmConfig
  private readonly agents: readonly SwarmAgent[]
  private readonly tokenTrackers: readonly TokenTrackingLlmProvider[]
  private readonly signalBus: SignalBus
  private readonly consensusEngine: ConsensusEngine
  private readonly roundRunner: RoundRunner
  private readonly contributionTracker: ContributionTracker
  private readonly synthesizer: Synthesizer | null
  private readonly mathBridge: MathBridge
  private readonly advisor: SwarmAdvisor | null
  private readonly debateRunner: DebateRunner | null
  private readonly agentSelector: AgentSelector | null
  private readonly evolutionController: EvolutionController | null
  private readonly calibrationTracker: CalibrationTracker
  private readonly globalWorkspace: GlobalWorkspace
  private readonly predictionEngine: PredictionEngine
  private readonly events: TypedEventEmitter<SwarmEventMap>
  private readonly onError: ErrorHandler

  // ── Evolution state (reset per solve) ──
  private evolvedAgents: SwarmAgent[] = []
  private evolvedTrackers: TokenTrackingLlmProvider[] = []
  private evolvedDisabled = new Set<string>()

  constructor(config: SwarmConfig) {
    this.config = resolveSwarmConfig(config)
    this.onError = this.config.onError
    this.events = new TypedEventEmitter<SwarmEventMap>()
    this.contributionTracker = new ContributionTracker()
    this.roundRunner = new RoundRunner()

    this.signalBus = new SignalBus(
      { sweepIntervalMs: 0, defaultTtlMs: this.config.timeout * 2 },
      this.events,
    )

    this.consensusEngine = new ConsensusEngine(
      this.config.consensus,
      this.events,
    )

    const trackers: TokenTrackingLlmProvider[] = []
    const agents: SwarmAgent[] = []

    for (const def of this.config.agents) {
      const resilient = new ResilientLlmProvider(def.engine.llm, this.config.retry)
      const tracker = new TokenTrackingLlmProvider(resilient)
      trackers.push(tracker)

      const engineConfig = { ...def.engine, llm: tracker }
      const orchestrator = new CognitiveOrchestrator(engineConfig)
      const storage = this.config.banditStorage ?? new MemoryBanditStorage()
      const bandit = new ThompsonBandit(storage)
      agents.push(new SwarmAgent(orchestrator, bandit, def.config, def.toolSupport))
    }

    if (this.config.tokenBudget !== null) {
      const getSharedTotal = () =>
        trackers.reduce((sum, t) => sum + t.totalTokens, 0)
      for (const tracker of trackers) {
        tracker.setBudget(this.config.tokenBudget, getSharedTotal)
      }
    }

    this.tokenTrackers = trackers
    this.agents = agents

    this.synthesizer = this.config.synthesizer
      ? new Synthesizer(
          this.config.synthesizer.llm,
          this.config.synthesizer.prompt,
        )
      : null

    this.mathBridge = new MathBridge(this.config.math)
    this.mathBridge.setAgentCount(this.agents.length)
    this.mathBridge.setMaxRounds(this.config.maxRounds)

    this.advisor = this.config.advisor
      ? new SwarmAdvisor(this.config.advisor, this.events)
      : null

    this.debateRunner = this.config.consensus.conflictResolution === 'debate'
      ? new DebateRunner()
      : null

    this.agentSelector = this.config.agentSelection
      ? new AgentSelector(this.config.agentSelection)
      : null

    this.evolutionController = this.config.evolution.enabled
      ? new EvolutionController(this.config.evolution)
      : null

    this.calibrationTracker = new CalibrationTracker()
    this.globalWorkspace = new GlobalWorkspace()
    this.predictionEngine = new PredictionEngine()

    // Wire prediction engine into agent selector for surprise-based scoring
    if (this.agentSelector) {
      this.agentSelector.setPredictionEngine(this.predictionEngine)
    }
  }

  /**
   * Solve a task using the swarm.
   * Runs the round-based loop until consensus or limits are reached.
   */
  async solve(task: string): Promise<SwarmResult> {
    const solveId = uid('solve')
    const startTime = Date.now()
    this.contributionTracker.reset()
    this.mathBridge.reset()
    this.advisor?.reset()
    this.resetEvolution()
    this.globalWorkspace.reset()
    this.predictionEngine.reset()
    for (const tracker of this.tokenTrackers) tracker.reset()

    if (this.agentSelector && this.config.banditStorage) {
      await this.agentSelector.loadBanditScores(this.config.banditStorage)
    }

    const taskSignal: Signal<'task:new'> = {
      id: uid('sig'),
      type: 'task:new',
      source: 'orchestrator',
      payload: { task },
      confidence: 1,
      timestamp: Date.now(),
    }

    this.signalBus.publish(taskSignal)
    let pendingSignals: readonly Signal[] = [taskSignal]
    let totalSignals = 1
    let roundsUsed = 0
    let consensus: ConsensusResult | null = null
    const debateResults: DebateResult[] = []
    const debatedPairs = new Set<string>()
    const allReactions: AgentReaction[] = []

    const memorySignals = await this.recallMemories(task)
    if (memorySignals.length > 0) {
      for (const ms of memorySignals) this.signalBus.publish(ms)
      pendingSignals = [...pendingSignals, ...memorySignals]
      totalSignals += memorySignals.length
    }

    for (let round = 0; round < this.config.maxRounds; round++) {
      if (pendingSignals.length === 0) break
      if (totalSignals >= this.config.maxSignals) break
      if (Date.now() - startTime >= this.config.timeout) break
      if (this.isTokenBudgetExhausted()) break

      roundsUsed = round + 1
      this.events.emit('round:start', { round: roundsUsed })

      const activeAgents = this.activeAgents

      // Predictive Processing: generate predictions before the round
      const predictions = activeAgents.map(a =>
        this.predictionEngine.generatePrediction(a.id, roundsUsed),
      )

      const roundResult = await this.roundRunner.run({
        agents: activeAgents,
        pendingSignals,
        contributionTracker: this.contributionTracker,
        events: this.events,
        disabledAgents: this.advisor?.disabledAgents,
        topology: this.advisor?.currentTopology?.neighbors,
        agentSelector: this.agentSelector ?? undefined,
        globalWorkspace: this.globalWorkspace,
      })

      for (const signal of roundResult.newSignals) {
        this.signalBus.publish(signal)
      }
      for (const reaction of roundResult.reactions) {
        allReactions.push(reaction)
      }

      totalSignals += roundResult.newSignals.length
      pendingSignals = roundResult.newSignals

      // Predictive Processing: compute prediction errors after the round
      this.predictionEngine.computeErrors(predictions, roundResult.newSignals, roundsUsed)

      const allProposals = this.signalBus.getHistory({ type: 'proposal' })
      const allVotes = this.signalBus.getHistory({ type: 'vote' })
      this.mathBridge.processRound(roundResult.newSignals, allProposals, allVotes)

      if (this.advisor) {
        const agentIds = activeAgents.map((a) => a.id)
        const advice = await this.advisor.evaluateRound(
          roundResult.newSignals,
          roundsUsed,
          this.mathBridge,
          agentIds,
        )
        for (const action of advice) {
          if (action.type === 'inject-signal') {
            this.signalBus.publish(action.signal)
            pendingSignals = [...pendingSignals, action.signal]
            totalSignals++
          }
          if (action.type === 'update-topology') {
            this.events?.emit('topology:updated', {
              neighbors: action.neighbors,
              reason: action.reason,
            })
          }
        }
      }

      // ── Evolution: spawn/dissolve agents mid-solve ──
      if (this.evolutionController) {
        const mathAnalysis = this.mathBridge.analyze()
        const contributions = this.contributionTracker.getContributions()
        const agentIds = activeAgents.map(a => a.id)
        const evolutionActions = this.evolutionController.evaluateRound(
          roundsUsed, mathAnalysis, contributions, agentIds,
        )
        if (evolutionActions.length > 0) {
          this.applyEvolutionActions(evolutionActions)
        }
      }

      // ── Feedback loop: math analysis → swarm behavior ──
      const controlSignals = this.mathBridge.getControlSignals()

      // Inject challenge if phase detector or free energy recommends it
      const challengeSignals = this.injectMathDrivenChallenge(controlSignals)
      if (challengeSignals.length > 0) {
        pendingSignals = [...pendingSignals, ...challengeSignals]
        totalSignals += challengeSignals.length
      }

      await this.storeDiscoveries(roundResult.newSignals, round + 1)
      await this.reinforceFromVotes(roundResult.newSignals)

      if (this.mathBridge.shouldStop()) {
        this.events.emit('round:end', { round: roundsUsed, signalCount: roundResult.newSignals.length })
        break
      }

      let { proposals, votes } = this.extractProposalsAndVotes()

      // Apply attention weights: surprise-informed vote amplification
      votes = this.applyAttentionWeights(votes)

      if (this.advisor) {
        votes = this.advisor.applyReputationWeights(votes)
      }

      if (this.consensusEngine.canEvaluate(proposals, votes)) {
        const result = this.consensusEngine.evaluate(proposals, votes)
        if (result.decided) {
          consensus = result
          if (this.advisor && result.proposalId) {
            this.advisor.recordConsensusOutcome(result.proposalId, votes)
          }
          this.events.emit('round:end', { round: roundsUsed, signalCount: roundResult.newSignals.length })
          break
        }

        if (this.debateRunner && proposals.length >= 2) {
          const debateResult = await this.tryDebate(
            proposals,
            debatedPairs,
          )
          if (debateResult) {
            debateResults.push(debateResult)
            totalSignals += debateResult.signals.length
            if (debateResult.resolved) {
              const updated = this.extractProposalsAndVotes()
              let updatedVotes = this.applyAttentionWeights(updated.votes)
              if (this.advisor) {
                updatedVotes = this.advisor.applyReputationWeights(updatedVotes)
              }
              const reResult = this.consensusEngine.evaluate(updated.proposals, updatedVotes)
              if (reResult.decided) {
                consensus = reResult
                if (this.advisor && reResult.proposalId) {
                  this.advisor.recordConsensusOutcome(reResult.proposalId, updatedVotes)
                }
                this.events.emit('round:end', { round: roundsUsed, signalCount: roundResult.newSignals.length })
                break
              }
            }
            pendingSignals = debateResult.signals
          }
        }
      }

      this.events.emit('round:end', { round: roundsUsed, signalCount: roundResult.newSignals.length })
    }

    if (this.config.memory) {
      try {
        await this.config.memory.decay()
      } catch (error: unknown) {
        this.onError(error, 'orchestrator.memory-decay')
      }
    }

    if (!consensus) {
      let { proposals, votes } = this.extractProposalsAndVotes()
      votes = this.applyAttentionWeights(votes)
      if (this.advisor) {
        votes = this.advisor.applyReputationWeights(votes)
      }
      if (proposals.length > 0) {
        consensus = this.consensusEngine.evaluate(proposals, votes)
      }
    }

    const finalConsensus: ConsensusResult = consensus ?? {
      decided: false,
      confidence: 0,
      votingRecord: [],
      dissent: [],
      reasoning: 'No proposals were generated',
      resolvedConflicts: [],
      durationMs: 0,
    }

    let answer: string
    if (this.synthesizer) {
      this.events.emit('synthesis:start', {} as Record<string, never>)
      const discoveries = this.signalBus.getHistory({ type: 'discovery' })
      const proposals = this.signalBus.getHistory({ type: 'proposal' })
      answer = await this.synthesizer.synthesize(
        task,
        finalConsensus,
        discoveries,
        proposals,
      )
      this.events.emit('synthesis:complete', { answer })
    } else {
      answer = finalConsensus.decision ?? 'No consensus reached'
    }

    await this.recordBanditFeedback(finalConsensus, allReactions)

    // Record calibration data for self-model improvement
    this.calibrationTracker.recordSolveOutcome(
      allReactions, finalConsensus, this.signalBus.getHistory(),
    )

    const totalTokens = this.tokenTrackers.reduce(
      (sum, t) => sum + t.totalTokens,
      0,
    )

    return {
      solveId,
      answer,
      confidence: finalConsensus.confidence,
      consensus: finalConsensus,
      signalLog: this.signalBus.getHistory(),
      agentContributions: this.contributionTracker.getContributions(),
      cost: {
        tokens: totalTokens,
        estimatedUsd: totalTokens * COST_PER_TOKEN_USD,
      },
      timing: {
        totalMs: Date.now() - startTime,
        roundsUsed,
      },
      mathAnalysis: this.mathBridge.analyze(),
      advisorReport: this.advisor?.getReport() ?? null,
      debateResults,
      evolutionReport: this.evolutionController?.getReport() ?? null,
    }
  }

  /**
   * Solve a task with checkpoint/resume support.
   *
   * If checkpointId is provided and a checkpoint exists, restores state
   * and continues from where the previous run left off. Saves a checkpoint
   * after each round. Deletes the checkpoint on successful completion.
   */
  async solveResumable(task: string, checkpointId?: string): Promise<SwarmResult> {
    const storage = this.config.checkpoint
    if (!storage) {
      return this.solve(task)
    }

    const solveId = uid('solve')
    const id = checkpointId ?? uid('ckpt')
    const existing = checkpointId ? await storage.load(checkpointId) : null

    if (existing) {
      // Restore state from checkpoint
      for (const signal of existing.signals) {
        this.signalBus.publish(signal)
      }
    }

    const startTime = Date.now()
    this.contributionTracker.reset()
    this.mathBridge.reset()
    this.advisor?.reset()
    this.resetEvolution()
    this.predictionEngine.reset()
    for (const tracker of this.tokenTrackers) tracker.reset()

    if (this.agentSelector && this.config.banditStorage) {
      await this.agentSelector.loadBanditScores(this.config.banditStorage)
    }

    const startRound = existing?.roundsCompleted ?? 0
    let pendingSignals: readonly Signal[]
    let totalSignals: number
    let roundsUsed = startRound

    if (existing) {
      // Resume: use all checkpoint signals as pending for next round
      pendingSignals = existing.signals
      totalSignals = existing.signals.length
    } else {
      // Fresh start
      const taskSignal: Signal<'task:new'> = {
        id: uid('sig'),
        type: 'task:new',
        source: 'orchestrator',
        payload: { task },
        confidence: 1,
        timestamp: Date.now(),
      }
      this.signalBus.publish(taskSignal)
      pendingSignals = [taskSignal]
      totalSignals = 1

      const memorySignals = await this.recallMemories(task)
      if (memorySignals.length > 0) {
        for (const ms of memorySignals) this.signalBus.publish(ms)
        pendingSignals = [...pendingSignals, ...memorySignals]
        totalSignals += memorySignals.length
      }
    }

    let consensus: ConsensusResult | null = null
    const debateResults: DebateResult[] = []
    const debatedPairs = new Set<string>()
    const allReactions: AgentReaction[] = []

    for (let round = startRound; round < this.config.maxRounds; round++) {
      if (pendingSignals.length === 0) break
      if (totalSignals >= this.config.maxSignals) break
      if (Date.now() - startTime >= this.config.timeout) break

      roundsUsed = round + 1
      this.events.emit('round:start', { round: roundsUsed })

      const activeAgents = this.activeAgents

      // Predictive Processing: generate predictions before the round
      const predictions = activeAgents.map(a =>
        this.predictionEngine.generatePrediction(a.id, roundsUsed),
      )

      const roundResult = await this.roundRunner.run({
        agents: activeAgents,
        pendingSignals,
        contributionTracker: this.contributionTracker,
        events: this.events,
        disabledAgents: this.advisor?.disabledAgents,
        topology: this.advisor?.currentTopology?.neighbors,
        agentSelector: this.agentSelector ?? undefined,
        globalWorkspace: this.globalWorkspace,
      })

      for (const signal of roundResult.newSignals) {
        this.signalBus.publish(signal)
      }
      for (const reaction of roundResult.reactions) {
        allReactions.push(reaction)
      }

      totalSignals += roundResult.newSignals.length
      pendingSignals = roundResult.newSignals

      // Predictive Processing: compute prediction errors after the round
      this.predictionEngine.computeErrors(predictions, roundResult.newSignals, roundsUsed)

      const allProposals = this.signalBus.getHistory({ type: 'proposal' })
      const allVotes = this.signalBus.getHistory({ type: 'vote' })
      this.mathBridge.processRound(roundResult.newSignals, allProposals, allVotes)

      if (this.advisor) {
        const agentIds = activeAgents.map((a) => a.id)
        const advice = await this.advisor.evaluateRound(
          roundResult.newSignals,
          roundsUsed,
          this.mathBridge,
          agentIds,
        )
        for (const action of advice) {
          if (action.type === 'inject-signal') {
            this.signalBus.publish(action.signal)
            pendingSignals = [...pendingSignals, action.signal]
            totalSignals++
          }
          if (action.type === 'update-topology') {
            this.events?.emit('topology:updated', {
              neighbors: action.neighbors,
              reason: action.reason,
            })
          }
        }
      }

      // ── Evolution: spawn/dissolve agents mid-solve ──
      if (this.evolutionController) {
        const mathAnalysis = this.mathBridge.analyze()
        const contributions = this.contributionTracker.getContributions()
        const agentIds = activeAgents.map(a => a.id)
        const evolutionActions = this.evolutionController.evaluateRound(
          roundsUsed, mathAnalysis, contributions, agentIds,
        )
        if (evolutionActions.length > 0) {
          this.applyEvolutionActions(evolutionActions)
        }
      }

      // ── Feedback loop: math analysis → swarm behavior ──
      const controlSignals = this.mathBridge.getControlSignals()
      const challengeSignals = this.injectMathDrivenChallenge(controlSignals)
      if (challengeSignals.length > 0) {
        pendingSignals = [...pendingSignals, ...challengeSignals]
        totalSignals += challengeSignals.length
      }

      await this.storeDiscoveries(roundResult.newSignals, round + 1)
      await this.reinforceFromVotes(roundResult.newSignals)

      // Save checkpoint after each round
      await this.saveCheckpoint(id, task, round + 1, this.signalBus.getHistory())

      if (this.mathBridge.shouldStop()) {
        this.events.emit('round:end', { round: roundsUsed, signalCount: roundResult.newSignals.length })
        break
      }

      let { proposals, votes } = this.extractProposalsAndVotes()

      votes = this.applyAttentionWeights(votes)
      if (this.advisor) {
        votes = this.advisor.applyReputationWeights(votes)
      }

      if (this.consensusEngine.canEvaluate(proposals, votes)) {
        const result = this.consensusEngine.evaluate(proposals, votes)
        if (result.decided) {
          consensus = result
          if (this.advisor && result.proposalId) {
            this.advisor.recordConsensusOutcome(result.proposalId, votes)
          }
          this.events.emit('round:end', { round: roundsUsed, signalCount: roundResult.newSignals.length })
          break
        }

        if (this.debateRunner && proposals.length >= 2) {
          const debateResult = await this.tryDebate(
            proposals,
            debatedPairs,
          )
          if (debateResult) {
            debateResults.push(debateResult)
            totalSignals += debateResult.signals.length
            if (debateResult.resolved) {
              const updated = this.extractProposalsAndVotes()
              let updatedVotes = this.applyAttentionWeights(updated.votes)
              if (this.advisor) {
                updatedVotes = this.advisor.applyReputationWeights(updatedVotes)
              }
              const reResult = this.consensusEngine.evaluate(updated.proposals, updatedVotes)
              if (reResult.decided) {
                consensus = reResult
                if (this.advisor && reResult.proposalId) {
                  this.advisor.recordConsensusOutcome(reResult.proposalId, updatedVotes)
                }
                this.events.emit('round:end', { round: roundsUsed, signalCount: roundResult.newSignals.length })
                break
              }
            }
            pendingSignals = debateResult.signals
          }
        }
      }

      this.events.emit('round:end', { round: roundsUsed, signalCount: roundResult.newSignals.length })
    }

    if (this.config.memory) {
      try {
        await this.config.memory.decay()
      } catch (error: unknown) {
        this.onError(error, 'orchestrator.memory-decay')
      }
    }

    if (!consensus) {
      let { proposals, votes } = this.extractProposalsAndVotes()
      votes = this.applyAttentionWeights(votes)
      if (this.advisor) {
        votes = this.advisor.applyReputationWeights(votes)
      }
      if (proposals.length > 0) {
        consensus = this.consensusEngine.evaluate(proposals, votes)
      }
    }

    const finalConsensus: ConsensusResult = consensus ?? {
      decided: false,
      confidence: 0,
      votingRecord: [],
      dissent: [],
      reasoning: 'No proposals were generated',
      resolvedConflicts: [],
      durationMs: 0,
    }

    let answer: string
    if (this.synthesizer) {
      this.events.emit('synthesis:start', {} as Record<string, never>)
      const discoveries = this.signalBus.getHistory({ type: 'discovery' })
      const proposals = this.signalBus.getHistory({ type: 'proposal' })
      answer = await this.synthesizer.synthesize(
        task,
        finalConsensus,
        discoveries,
        proposals,
      )
      this.events.emit('synthesis:complete', { answer })
    } else {
      answer = finalConsensus.decision ?? 'No consensus reached'
    }

    await this.recordBanditFeedback(finalConsensus, allReactions)

    // Delete checkpoint on successful completion
    await storage.delete(id)

    const totalTokens = this.tokenTrackers.reduce(
      (sum, t) => sum + t.totalTokens,
      0,
    )

    return {
      solveId,
      answer,
      confidence: finalConsensus.confidence,
      consensus: finalConsensus,
      signalLog: this.signalBus.getHistory(),
      agentContributions: this.contributionTracker.getContributions(),
      cost: {
        tokens: totalTokens,
        estimatedUsd: totalTokens * COST_PER_TOKEN_USD,
      },
      timing: {
        totalMs: Date.now() - startTime,
        roundsUsed,
      },
      mathAnalysis: this.mathBridge.analyze(),
      advisorReport: this.advisor?.getReport() ?? null,
      debateResults,
      evolutionReport: this.evolutionController?.getReport() ?? null,
    }
  }

  /**
   * Solve with streaming - yields SwarmEvents as they occur.
   * The final event is always `solve:complete` with the full SwarmResult.
   */
  async *solveWithStream(task: string): AsyncIterable<SwarmEvent> {
    const solveId = uid('solve')
    const startTime = Date.now()
    this.contributionTracker.reset()
    this.mathBridge.reset()
    this.advisor?.reset()
    this.resetEvolution()
    this.predictionEngine.reset()
    for (const tracker of this.tokenTrackers) tracker.reset()

    if (this.agentSelector && this.config.banditStorage) {
      await this.agentSelector.loadBanditScores(this.config.banditStorage)
    }

    yield { type: 'solve:start', task }

    const taskSignal: Signal<'task:new'> = {
      id: uid('sig'),
      type: 'task:new',
      source: 'orchestrator',
      payload: { task },
      confidence: 1,
      timestamp: Date.now(),
    }

    this.signalBus.publish(taskSignal)
    yield { type: 'signal:emitted', signal: taskSignal }

    let pendingSignals: readonly Signal[] = [taskSignal]
    let totalSignals = 1
    let roundsUsed = 0
    let consensus: ConsensusResult | null = null
    const debateResults: DebateResult[] = []
    const debatedPairs = new Set<string>()
    const allReactions: AgentReaction[] = []

    const memorySignals = await this.recallMemories(task)
    for (const ms of memorySignals) {
      this.signalBus.publish(ms)
      yield { type: 'signal:emitted', signal: ms }
    }
    if (memorySignals.length > 0) {
      pendingSignals = [...pendingSignals, ...memorySignals]
      totalSignals += memorySignals.length
    }

    for (let round = 0; round < this.config.maxRounds; round++) {
      if (pendingSignals.length === 0) break
      if (totalSignals >= this.config.maxSignals) break
      if (Date.now() - startTime >= this.config.timeout) break
      if (this.isTokenBudgetExhausted()) break

      roundsUsed = round + 1
      this.events.emit('round:start', { round: roundsUsed })
      yield { type: 'round:start', round: roundsUsed }

      const activeAgents = this.activeAgents

      // Predictive Processing: generate predictions before the round
      const predictions = activeAgents.map(a =>
        this.predictionEngine.generatePrediction(a.id, roundsUsed),
      )

      const roundResult = await this.roundRunner.run({
        agents: activeAgents,
        pendingSignals,
        contributionTracker: this.contributionTracker,
        events: this.events,
        disabledAgents: this.advisor?.disabledAgents,
        topology: this.advisor?.currentTopology?.neighbors,
        agentSelector: this.agentSelector ?? undefined,
        globalWorkspace: this.globalWorkspace,
      })

      for (const reaction of roundResult.reactions) {
        allReactions.push(reaction)
        yield { type: 'agent:reacted', reaction }
      }
      for (const signal of roundResult.newSignals) {
        this.signalBus.publish(signal)
        yield { type: 'signal:emitted', signal }
      }

      totalSignals += roundResult.newSignals.length
      pendingSignals = roundResult.newSignals

      // Predictive Processing: compute prediction errors after the round
      this.predictionEngine.computeErrors(predictions, roundResult.newSignals, roundsUsed)

      const allProposals = this.signalBus.getHistory({ type: 'proposal' })
      const allVotes = this.signalBus.getHistory({ type: 'vote' })
      this.mathBridge.processRound(roundResult.newSignals, allProposals, allVotes)

      if (this.advisor) {
        const agentIds = activeAgents.map((a) => a.id)
        const advice = await this.advisor.evaluateRound(
          roundResult.newSignals,
          roundsUsed,
          this.mathBridge,
          agentIds,
        )
        for (const action of advice) {
          yield { type: 'advisor:action', advice: action }
          if (action.type === 'inject-signal') {
            this.signalBus.publish(action.signal)
            yield { type: 'signal:emitted', signal: action.signal }
            pendingSignals = [...pendingSignals, action.signal]
            totalSignals++
          }
          if (action.type === 'update-topology') {
            yield {
              type: 'topology:updated',
              neighbors: action.neighbors,
              reason: action.reason,
            }
          }
        }
      }

      // ── Evolution: spawn/dissolve agents mid-solve ──
      if (this.evolutionController) {
        const mathAnalysis = this.mathBridge.analyze()
        const contributions = this.contributionTracker.getContributions()
        const agentIds = activeAgents.map(a => a.id)
        const evolutionActions = this.evolutionController.evaluateRound(
          roundsUsed, mathAnalysis, contributions, agentIds,
        )
        if (evolutionActions.length > 0) {
          this.applyEvolutionActions(evolutionActions)
          for (const ea of evolutionActions) {
            if (ea.type === 'spawn') {
              yield { type: 'evolution:spawned', agentId: ea.domain, domain: ea.domain, reason: ea.proposal.roleDescription ?? ea.proposal.role }
            } else {
              yield { type: 'evolution:dissolved', agentId: ea.agentId, reason: ea.reason }
            }
          }
        }
      }

      // ── Feedback loop: math analysis → swarm behavior ──
      const controlSignals = this.mathBridge.getControlSignals()
      const challengeSignals = this.injectMathDrivenChallenge(controlSignals)
      if (challengeSignals.length > 0) {
        for (const sig of challengeSignals) {
          yield { type: 'signal:emitted', signal: sig }
        }
        pendingSignals = [...pendingSignals, ...challengeSignals]
        totalSignals += challengeSignals.length
      }

      await this.storeDiscoveries(roundResult.newSignals, roundsUsed)
      await this.reinforceFromVotes(roundResult.newSignals)

      const mathState = this.mathBridge.currentEntropy()
      yield {
        type: 'math:round-analysis',
        round: roundsUsed,
        entropy: mathState.entropy,
        normalizedEntropy: mathState.normalized,
        informationGain: mathState.informationGain,
      }

      if (this.mathBridge.shouldStop()) {
        this.events.emit('round:end', { round: roundsUsed, signalCount: roundResult.newSignals.length })
        yield {
          type: 'round:end',
          round: roundsUsed,
          signalCount: roundResult.newSignals.length,
        }
        break
      }

      let { proposals, votes } = this.extractProposalsAndVotes()
      votes = this.applyAttentionWeights(votes)
      if (this.advisor) {
        votes = this.advisor.applyReputationWeights(votes)
      }
      if (this.consensusEngine.canEvaluate(proposals, votes)) {
        const result = this.consensusEngine.evaluate(proposals, votes)
        yield { type: 'consensus:check', result }
        if (result.decided) {
          consensus = result
          if (this.advisor && result.proposalId) {
            this.advisor.recordConsensusOutcome(result.proposalId, votes)
          }
          this.events.emit('round:end', { round: roundsUsed, signalCount: roundResult.newSignals.length })
          yield {
            type: 'round:end',
            round: roundsUsed,
            signalCount: roundResult.newSignals.length,
          }
          break
        }

        if (this.debateRunner && proposals.length >= 2) {
          const debateResult = await this.tryDebate(
            proposals,
            debatedPairs,
          )
          if (debateResult) {
            debateResults.push(debateResult)
            totalSignals += debateResult.signals.length
            for (const sig of debateResult.signals) {
              yield { type: 'signal:emitted', signal: sig }
            }
            if (debateResult.resolved) {
              const updated = this.extractProposalsAndVotes()
              let updatedVotes = this.applyAttentionWeights(updated.votes)
              if (this.advisor) {
                updatedVotes = this.advisor.applyReputationWeights(updatedVotes)
              }
              const reResult = this.consensusEngine.evaluate(updated.proposals, updatedVotes)
              yield { type: 'consensus:check', result: reResult }
              if (reResult.decided) {
                consensus = reResult
                if (this.advisor && reResult.proposalId) {
                  this.advisor.recordConsensusOutcome(reResult.proposalId, updatedVotes)
                }
                this.events.emit('round:end', { round: roundsUsed, signalCount: roundResult.newSignals.length })
                yield {
                  type: 'round:end',
                  round: roundsUsed,
                  signalCount: roundResult.newSignals.length,
                }
                break
              }
            }
            pendingSignals = debateResult.signals
          }
        }
      }

      this.events.emit('round:end', { round: roundsUsed, signalCount: roundResult.newSignals.length })
      yield {
        type: 'round:end',
        round: roundsUsed,
        signalCount: roundResult.newSignals.length,
      }
    }

    if (this.config.memory) {
      try {
        await this.config.memory.decay()
      } catch (error: unknown) {
        this.onError(error, 'orchestrator.memory-decay')
      }
    }

    if (!consensus) {
      let { proposals, votes } = this.extractProposalsAndVotes()
      votes = this.applyAttentionWeights(votes)
      if (this.advisor) {
        votes = this.advisor.applyReputationWeights(votes)
      }
      if (proposals.length > 0) {
        const result = this.consensusEngine.evaluate(proposals, votes)
        yield { type: 'consensus:check', result }
        consensus = result
      }
    }

    const finalConsensus: ConsensusResult = consensus ?? {
      decided: false,
      confidence: 0,
      votingRecord: [],
      dissent: [],
      reasoning: 'No proposals were generated',
      resolvedConflicts: [],
      durationMs: 0,
    }

    let answer: string
    if (this.synthesizer) {
      this.events.emit('synthesis:start', {} as Record<string, never>)
      yield { type: 'synthesis:start' }
      const discoveries = this.signalBus.getHistory({ type: 'discovery' })
      const proposals = this.signalBus.getHistory({ type: 'proposal' })
      answer = await this.synthesizer.synthesize(
        task,
        finalConsensus,
        discoveries,
        proposals,
      )
      this.events.emit('synthesis:complete', { answer })
      yield { type: 'synthesis:complete', answer }
    } else {
      answer = finalConsensus.decision ?? 'No consensus reached'
    }

    await this.recordBanditFeedback(finalConsensus, allReactions)

    const totalTokens = this.tokenTrackers.reduce(
      (sum, t) => sum + t.totalTokens,
      0,
    )

    const result: SwarmResult = {
      solveId,
      answer,
      confidence: finalConsensus.confidence,
      consensus: finalConsensus,
      signalLog: this.signalBus.getHistory(),
      agentContributions: this.contributionTracker.getContributions(),
      cost: {
        tokens: totalTokens,
        estimatedUsd: totalTokens * COST_PER_TOKEN_USD,
      },
      timing: {
        totalMs: Date.now() - startTime,
        roundsUsed,
      },
      mathAnalysis: this.mathBridge.analyze(),
      advisorReport: this.advisor?.getReport() ?? null,
      debateResults,
      evolutionReport: this.evolutionController?.getReport() ?? null,
    }

    yield { type: 'solve:complete', result }
  }

  /** Register a callback for signal events. */
  onSignal(callback: (signal: Signal) => void): () => void {
    const handler = (signal: Signal): void => callback(signal)
    this.events.on('signal:emitted', handler)
    return () => this.events.off('signal:emitted', handler)
  }

  /** Register a typed event listener. Returns cleanup function. */
  on<K extends keyof SwarmEventMap & string>(
    event: K,
    handler: (data: SwarmEventMap[K]) => void,
  ): () => void {
    this.events.on(event, handler)
    return () => this.events.off(event, handler)
  }

  /** Clean up all resources. */
  destroy(): void {
    this.signalBus.destroy()
    this.events.removeAllListeners()
  }

  /** All active agents: base + evolved, excluding disabled. */
  private get activeAgents(): readonly SwarmAgent[] {
    const all = [...this.agents, ...this.evolvedAgents]
    if (this.evolvedDisabled.size === 0) return all
    return all.filter(a => !this.evolvedDisabled.has(a.id))
  }

  /** Reset evolution state for a new solve. */
  private resetEvolution(): void {
    this.evolvedAgents = []
    this.evolvedTrackers = []
    this.evolvedDisabled.clear()
    this.evolutionController?.reset()
  }

  /**
   * Apply evolution actions from EvolutionController.
   * Spawn = create new SwarmAgent from proposal preset.
   * Dissolve = disable the agent.
   */
  private applyEvolutionActions(actions: readonly EvolutionAction[]): void {
    for (const action of actions) {
      if (action.type === 'spawn') {
        const agentId = uid('evolved')
        const proposal = action.proposal

        // Reuse the first agent's engine config as template for evolved agents
        const templateEngine = this.config.agents[0]?.engine
        if (!templateEngine) continue

        const resilient = new ResilientLlmProvider(templateEngine.llm, this.config.retry)
        const tracker = new TokenTrackingLlmProvider(resilient)
        this.evolvedTrackers.push(tracker)

        if (this.config.tokenBudget !== null) {
          const allTrackers = [...this.tokenTrackers, ...this.evolvedTrackers]
          const getSharedTotal = () =>
            allTrackers.reduce((sum, t) => sum + t.totalTokens, 0)
          tracker.setBudget(this.config.tokenBudget, getSharedTotal)
        }

        const engineConfig: EngineConfig = { ...templateEngine, llm: tracker }
        const orchestrator = new CognitiveOrchestrator(engineConfig)
        const storage = this.config.banditStorage ?? new MemoryBanditStorage()
        const bandit = new ThompsonBandit(storage)

        const agent = new SwarmAgent(orchestrator, bandit, {
          id: agentId,
          name: `evolved-${proposal.role}`,
          role: proposal.roleDescription ?? proposal.role,
          personality: proposal.personality,
          listens: [...proposal.listens],
          canEmit: [...proposal.canEmit],
        })

        this.evolvedAgents.push(agent)

        this.events.emit('evolution:spawned', {
          agentId,
          domain: action.domain,
          reason: proposal.roleDescription ?? proposal.role,
        })
      } else if (action.type === 'dissolve') {
        this.evolvedDisabled.add(action.agentId)

        this.events.emit('evolution:dissolved', {
          agentId: action.agentId,
          reason: action.reason,
        })
      }
    }
  }

  /** Check whether the token budget has been exhausted. */
  private isTokenBudgetExhausted(): boolean {
    if (this.config.tokenBudget === null) return false
    const currentTokens = this.tokenTrackers.reduce(
      (sum, t) => sum + t.totalTokens,
      0,
    )
    return currentTokens >= this.config.tokenBudget
  }

  /**
   * Persist a checkpoint for resumable solves.
   * No-op if no checkpoint storage is configured.
   */
  private async saveCheckpoint(
    id: string,
    task: string,
    roundsCompleted: number,
    signals: readonly Signal[],
  ): Promise<void> {
    if (!this.config.checkpoint) return
    try {
      await this.config.checkpoint.save(id, {
        task,
        roundsCompleted,
        signals,
        agentContributions: this.contributionTracker.getContributions(),
        tokensUsed: this.tokenTrackers.reduce((sum, t) => sum + t.totalTokens, 0),
        timestamp: Date.now(),
      })
    } catch (error: unknown) {
      this.onError(error, 'orchestrator.checkpoint-save')
    }
  }

  /**
   * Apply attention weights from surprise analysis to vote weights.
   *
   * Attention is clamped to [0.8, 1.2] — a mild nudge, not a multiplier.
   * Surprise-based priority belongs in signal routing (AgentSelector),
   * not in consensus vote weighting. Unbounded attention (up to 3x)
   * was causing surprising agents to drown out agreement and block consensus.
   */
  private applyAttentionWeights(
    votes: readonly VoteRecord[],
  ): readonly VoteRecord[] {
    if (this.mathBridge.roundNumber < 2) return votes

    const controlSignals = this.mathBridge.getControlSignals()
    const weights = controlSignals.attentionWeights

    // If no attention data yet, pass through unchanged
    if (Object.keys(weights).length === 0) return votes

    return votes.map((record) => {
      const rawAttention = weights[record.agentId] ?? 1.0
      // Clamp to mild range — surprise should inform routing, not dominate votes
      const attention = Math.max(0.8, Math.min(1.2, rawAttention))
      return {
        agentId: record.agentId,
        proposalId: record.proposalId,
        vote: {
          ...record.vote,
          weight: record.vote.weight * attention,
        },
        timestamp: record.timestamp,
      }
    })
  }

  /**
   * Inject a challenge signal when math analysis recommends it.
   * Called when phase detector detects 'ordered' phase (groupthink risk)
   * or free energy recommends 'challenge' (beliefs diverging from data).
   *
   * Returns injected signals to add to pending queue, or empty array.
   */
  private injectMathDrivenChallenge(
    controlSignals: SwarmControlSignals,
  ): readonly Signal[] {
    if (!controlSignals.shouldInjectChallenge) return []

    const target = controlSignals.challengeTarget
    const signal: Signal<'challenge'> = {
      id: uid('sig'),
      type: 'challenge',
      source: 'orchestrator',
      payload: {
        targetSignalId: target ?? 'consensus',
        counterArgument: controlSignals.phase === 'ordered'
          ? 'Phase detector: consensus too strong (ordered phase). Challenging to restore criticality and maximize collective intelligence.'
          : 'Free energy analysis: beliefs diverging from observations. Current direction may be suboptimal — consider alternatives.',
      },
      confidence: 0.8,
      timestamp: Date.now(),
    }

    this.signalBus.publish(signal)
    return [signal]
  }

  private extractProposalsAndVotes(): {
    proposals: readonly Proposal[]
    votes: readonly VoteRecord[]
  } {
    const proposalSignals = this.signalBus.getHistory({ type: 'proposal' })
    const voteSignals = this.signalBus.getHistory({ type: 'vote' })

    const proposals: Proposal[] = []
    for (const s of proposalSignals) {
      if (isProposalPayload(s.payload)) {
        proposals.push({
          id: s.payload.proposalId,
          content: s.payload.content,
          reasoning: s.payload.reasoning,
          sourceAgentId: s.source,
          sourceSignalId: s.id,
          confidence: s.confidence,
          timestamp: s.timestamp,
        })
      }
    }

    const votes: VoteRecord[] = []
    for (const s of voteSignals) {
      if (isVotePayload(s.payload)) {
        votes.push({
          agentId: s.source,
          proposalId: s.payload.proposalId,
          vote: s.payload,
          timestamp: s.timestamp,
          causalLevel: s.metadata?.causalLevel,
        })
      }
    }

    return { proposals, votes }
  }

  /**
   * Attempt a debate between the top two competing proposals.
   *
   * Returns null if the proposals have already been debated or
   * if no debate runner is configured.
   */
  private async tryDebate(
    proposals: readonly Proposal[],
    debatedPairs: Set<string>,
  ): Promise<DebateResult | null> {
    if (!this.debateRunner) return null
    if (proposals.length < 2) return null

    const sorted = [...proposals].sort((a, b) => b.confidence - a.confidence)
    const top = sorted.slice(0, 2)
    const pairKey = [top[0]!.id, top[1]!.id].sort().join(':')

    if (debatedPairs.has(pairKey)) return null
    debatedPairs.add(pairKey)

    const proposalSignals = this.signalBus.getHistory({ type: 'proposal' })
    const signalA = proposalSignals.find((s) =>
      isProposalPayload(s.payload) && s.payload.proposalId === top[0]!.id,
    )
    const signalB = proposalSignals.find((s) =>
      isProposalPayload(s.payload) && s.payload.proposalId === top[1]!.id,
    )

    if (!signalA || !signalB) return null

    const maxDebateRounds = typeof this.config.consensus.maxDebateRounds === 'number'
      ? this.config.consensus.maxDebateRounds
      : 3

    return this.debateRunner.runDebate({
      proposalA: signalA,
      proposalB: signalB,
      agents: this.agents,
      signalBus: this.signalBus,
      mathBridge: this.mathBridge,
      contributionTracker: this.contributionTracker,
      events: this.events,
      disabledAgents: this.advisor?.disabledAgents,
      topology: this.advisor?.currentTopology?.neighbors,
      maxRounds: maxDebateRounds,
      convergenceThreshold: DEFAULT_CONVERGENCE_THRESHOLD,
    })
  }

  /**
   * Search vector memory for prior knowledge relevant to the task.
   * Returns memory:shared signals that agents can react to.
   */
  private async recallMemories(task: string): Promise<Signal<'memory:shared'>[]> {
    if (!this.config.memory) return []

    try {
      const memories = await this.config.memory.search(task, 5)
      return memories.map((entry) => ({
        id: uid('sig'),
        type: 'memory:shared' as const,
        source: 'memory',
        payload: {
          content: entry.content,
          category: entry.metadata['category'] ?? 'prior-knowledge',
          importance: entry.strength * entry.relevance,
        },
        confidence: entry.relevance,
        timestamp: Date.now(),
      }))
    } catch (error: unknown) {
      this.onError(error, 'orchestrator.memory-recall')
      return []
    }
  }

  /**
   * Store valuable signals (discoveries, proposals, challenges) in vector memory.
   */
  private async storeDiscoveries(
    signals: readonly Signal[],
    round: number,
  ): Promise<void> {
    if (!this.config.memory) return

    for (const signal of signals) {
      try {
        if (signal.type === 'discovery' && isDiscoveryPayload(signal.payload)) {
          await this.config.memory.store(signal.payload.finding, {
            agent: signal.source,
            category: 'discovery',
            round: String(round),
            signalId: signal.id,
          })
        } else if (signal.type === 'proposal' && isProposalPayload(signal.payload)) {
          await this.config.memory.store(
            `${signal.payload.content}\n\nReasoning: ${signal.payload.reasoning}`,
            {
              agent: signal.source,
              category: 'proposal',
              round: String(round),
              signalId: signal.id,
              proposalId: signal.payload.proposalId,
            },
          )
        } else if (signal.type === 'challenge' && isChallengePayload(signal.payload)) {
          const text = signal.payload.alternativeProposal
            ? `${signal.payload.counterArgument}\n\nAlternative: ${signal.payload.alternativeProposal}`
            : signal.payload.counterArgument
          await this.config.memory.store(text, {
            agent: signal.source,
            category: 'challenge',
            round: String(round),
            signalId: signal.id,
            targetSignalId: signal.payload.targetSignalId,
          })
        }
      } catch (error: unknown) {
        this.onError(error, 'orchestrator.memory-store')
      }
    }
  }

  /**
   * Reinforce memories related to discoveries that received agreement votes.
   */
  private async reinforceFromVotes(
    signals: readonly Signal[],
  ): Promise<void> {
    if (!this.config.memory) return

    for (const signal of signals) {
      if (signal.type !== 'vote') continue
      if (!isVotePayload(signal.payload)) continue
      if (signal.payload.stance !== 'agree') continue

      // Reinforce the discovery that was voted on
      // Vote's replyTo points to the discovery signal
      if (signal.replyTo) {
        try {
          await this.config.memory.reinforce(signal.replyTo)
        } catch {
          // ID may not be in memory
        }
      }
    }
  }

  /**
   * Record bandit feedback with actual strategies and per-agent rewards.
   *
   * Reward formula per agent:
   * - Base reward: consensus.confidence if decided, 0 otherwise
   * - Bonus: +0.2 if agent authored the winning proposal
   * - Scaled by agent's avg confidence (proxy for signal quality)
   *
   * Each reaction gets feedback with its actual strategy and context vector.
   */
  private async recordBanditFeedback(
    consensus: ConsensusResult,
    reactions: readonly AgentReaction[],
  ): Promise<void> {
    const baseReward = consensus.decided ? consensus.confidence : 0

    // Find winning proposal author
    let winnerAgentId: string | null = null
    if (consensus.decided && consensus.proposalId) {
      const proposalSignals = this.signalBus.getHistory({ type: 'proposal' })
      const winner = proposalSignals.find(
        (s) => isProposalPayload(s.payload) && s.payload.proposalId === consensus.proposalId,
      )
      if (winner) winnerAgentId = winner.source
    }

    const contributions = this.contributionTracker.getContributions()

    // Resolve input signal for each reaction
    const signalMap = new Map<string, Signal>()
    for (const signal of this.signalBus.getHistory()) {
      signalMap.set(signal.id, signal)
    }

    for (const reaction of reactions) {
      if (reaction.strategyUsed === 'defer') continue

      const agent = this.agents.find((a) => a.id === reaction.agentId)
      if (!agent) continue

      // Per-agent reward
      const contrib = contributions.get(reaction.agentId)
      const qualityScale = contrib ? contrib.avgConfidence : 0.5
      const winnerBonus = reaction.agentId === winnerAgentId ? 0.2 : 0
      const reward = Math.min(1.0, (baseReward * qualityScale) + winnerBonus)

      // Use actual input signal for context vector
      const inputSignal = signalMap.get(reaction.inResponseTo)

      try {
        if (inputSignal) {
          await agent.recordFeedbackForSignal(reaction.strategyUsed, inputSignal, reward)
        } else {
          await agent.recordFeedback(reaction.strategyUsed, [], reward)
        }
      } catch (error: unknown) {
        this.onError(error, `orchestrator.bandit-feedback.${reaction.agentId}`)
      }
    }
  }

}

function isProposalPayload(
  payload: Signal['payload'],
): payload is ProposalPayload {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    'proposalId' in payload &&
    'content' in payload &&
    'reasoning' in payload
  )
}

function isVotePayload(
  payload: Signal['payload'],
): payload is VotePayload {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    'proposalId' in payload &&
    'stance' in payload &&
    'weight' in payload
  )
}

function isDiscoveryPayload(
  payload: Signal['payload'],
): payload is DiscoveryPayload {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    'finding' in payload &&
    'relevance' in payload
  )
}

function isChallengePayload(
  payload: Signal['payload'],
): payload is ChallengePayload {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    'targetSignalId' in payload &&
    'counterArgument' in payload
  )
}

const DEFAULT_MATH_CONFIG: ResolvedMathConfig = {
  entropyThreshold: 0.3,
  minInformationGain: 0.05,
  redundancyThreshold: 0.7,
}

function resolveSwarmConfig(config: SwarmConfig): ResolvedSwarmConfig {
  return {
    agents: config.agents,
    consensus: config.consensus ?? {},
    maxRounds: config.maxRounds ?? DEFAULT_MAX_ROUNDS,
    maxSignals: config.maxSignals ?? DEFAULT_MAX_SIGNALS,
    timeout: config.timeout ?? DEFAULT_TIMEOUT_MS,
    synthesizer: config.synthesizer ?? null,
    memory: config.memory ?? null,
    math: { ...DEFAULT_MATH_CONFIG, ...config.math },
    banditStorage: config.banditStorage ?? null,
    agentSelection: config.agentSelection ?? null,
    advisor: config.advisor
      ? {
          groupthinkCorrection: config.advisor.groupthinkCorrection ?? true,
          agentPruning: config.advisor.agentPruning ?? false,
          reputationWeighting: config.advisor.reputationWeighting ?? true,
          weightProvider: config.advisor.weightProvider ?? null,
          warmupRounds: config.advisor.warmupRounds ?? 2,
          topology: config.advisor.topology
            ? {
                enabled: config.advisor.topology.enabled ?? false,
                minConnectivity: config.advisor.topology.minConnectivity ?? 0.3,
                maxInfluenceConcentration: config.advisor.topology.maxInfluenceConcentration ?? 0.6,
                pruneRedundantLinks: config.advisor.topology.pruneRedundantLinks ?? true,
                protectBridgingAgents: config.advisor.topology.protectBridgingAgents ?? true,
              }
            : null,
          metaAgentLlm: config.advisor.metaAgentLlm ?? null,
          metaAgentInterval: config.advisor.metaAgentInterval ?? 3,
        }
      : null,
    retry: {
      maxRetries: config.retry?.maxRetries ?? 3,
      baseDelayMs: config.retry?.baseDelayMs ?? 1000,
      maxDelayMs: config.retry?.maxDelayMs ?? 10000,
      circuitBreakerThreshold: config.retry?.circuitBreakerThreshold ?? 5,
    },
    onError: config.onError ?? defaultErrorHandler,
    tokenBudget: config.tokenBudget ?? null,
    checkpoint: config.checkpoint ?? null,
    evolution: {
      enabled: config.evolution?.enabled ?? false,
      maxEvolvedAgents: config.evolution?.maxEvolvedAgents ?? 3,
      evaluationWindow: config.evolution?.evaluationWindow ?? 5,
      minValueForKeep: config.evolution?.minValueForKeep ?? 0.5,
      cooldownRounds: config.evolution?.cooldownRounds ?? 3,
      nmiPruneThreshold: config.evolution?.nmiPruneThreshold ?? 0.8,
    },
  }
}
