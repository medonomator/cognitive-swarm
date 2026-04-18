import type {
  Signal,
  ResolvedMathConfig,
  MathAnalysis,
  MathStoppingReason,
  SwarmControlSignals,
} from '@cognitive-swarm/core'
import {
  EntropyTracker,
  RedundancyDetector,
  MarkovChain,
  BeliefNetwork,
  voteToLikelihoodRatio,
  AgreeChallenge,
  OpinionDynamics,
  ReplicatorDynamics,
  InfluenceGraph,
  OptimalStopping,
  ShapleyValuator,
  SurpriseTracker,
  FreeEnergyTracker,
  FisherTracker,
  BeliefDistanceTracker,
  PhaseTransitionDetector,
} from '@cognitive-swarm/math'

// Feeds signal data into all math modules each round.
// Zero LLM calls. Pure math. O(signals^2) per round.
//
// Pipeline: surprise → free energy → fisher → optimal transport
//   Surprise measures KL(posterior || prior) per signal.
//   Free Energy F = λ·complexity - accuracy unifies all criteria into one scalar.
//   Fisher tracks learning efficiency (Cramér-Rao bound vs actual variance).
//   Optimal Transport measures Wasserstein distance between agent beliefs.
//
// Primary stopping criterion: F converged (ΔF ≈ 0).
// Secondary: Fisher learning stalled.
// Fallbacks: entropy, info gain, cycles, CUSUM, surprise collapse, fragmentation.

/** Minimum rounds before entropy-based stopping can trigger. */
const MIN_ROUNDS_FOR_ENTROPY = 2
/** Minimum rounds before information gain check can trigger. */
const MIN_ROUNDS_FOR_GAIN = 3
/** Minimum transitions before Markov cycle detection. */
const MIN_TRANSITIONS_FOR_MARKOV = 15
/** Markov cycle mass threshold (high = only strong cycles). */
const CYCLE_MASS_THRESHOLD = 0.85
/** Minimum rounds before cycle detection can trigger. */
const MIN_ROUNDS_FOR_CYCLES = 4
/** Minimum rounds before free energy convergence can trigger. */
const MIN_ROUNDS_FOR_FREE_ENERGY = 3
/** Minimum rounds before Fisher stall detection. */
const MIN_ROUNDS_FOR_FISHER = 4
/** Wasserstein distance threshold for belief clustering. */
const BELIEF_CLUSTER_THRESHOLD = 0.3

/**
 * Bridges swarm signals to all math analysis modules.
 *
 * Created once per orchestrator. Reset per solve() call.
 * Consumes signals each round, feeds to trackers,
 * provides stopping criteria + full analysis report.
 */
export class MathBridge {
  private readonly entropy = new EntropyTracker()
  private readonly redundancy = new RedundancyDetector()
  private readonly markov = new MarkovChain()
  private readonly gameTheory = new AgreeChallenge()
  private readonly opinionDynamics = new OpinionDynamics()
  private readonly influenceGraph = new InfluenceGraph()
  private readonly surprise = new SurpriseTracker()
  private readonly freeEnergy = new FreeEnergyTracker()
  private readonly fisher = new FisherTracker()
  private readonly beliefDistance = new BeliefDistanceTracker()
  private readonly phaseDetector = new PhaseTransitionDetector()
  private readonly config: ResolvedMathConfig
  private beliefNetwork: BeliefNetwork | null = null
  private replicatorDynamics: ReplicatorDynamics | null = null
  private optimalStopping: OptimalStopping | null = null
  private readonly knownProposalIds = new Set<string>()
  private readonly strategyEmissions = new Map<string, number>()
  private readonly strategyFitness = new Map<string, number[]>()
  private readonly agentSignalCounts = new Map<string, number>()
  private stoppingReason: MathStoppingReason | null = null
  private lastSignalType: string | null = null
  private challengeCount = 0
  private agentCount = 0
  private _roundNumber = 0

  constructor(config: ResolvedMathConfig) {
    this.config = config
  }

  /** Current round number. */
  get roundNumber(): number {
    return this._roundNumber
  }

  /** Set the number of agents (needed for game theory + optimal stopping). */
  setAgentCount(count: number): void {
    this.agentCount = count
  }

  /** Set max rounds (needed for optimal stopping Secretary Problem). */
  setMaxRounds(maxRounds: number): void {
    this.optimalStopping = new OptimalStopping(maxRounds)
  }

  /**
   * Feed signals from a completed round into all math modules.
   *
   * @param newSignals - signals produced this round
   * @param allProposals - all proposal signals seen so far
   * @param allVotes - all vote signals seen so far
   */
  processRound(
    newSignals: readonly Signal[],
    allProposals: readonly Signal[],
    allVotes: readonly Signal[],
  ): void {
    for (const signal of newSignals) {
      if (this.lastSignalType !== null) {
        this.markov.observe(this.lastSignalType, signal.type)
      }
      this.lastSignalType = signal.type

      this.redundancy.record({
        agentId: signal.source,
        signalType: signal.type,
        topic: signal.type,
      })

      if (signal.type === 'challenge') {
        this.challengeCount++
      }

      this.agentSignalCounts.set(
        signal.source,
        (this.agentSignalCounts.get(signal.source) ?? 0) + 1,
      )
    }

    // Snapshot prior beliefs BEFORE update for surprise measurement
    const priorSnapshot = this.beliefNetwork !== null
      ? new Map(this.beliefNetwork.getState().posteriors)
      : null

    this.updateBeliefs(allProposals, allVotes)

    // Measure Bayesian Surprise: KL(posterior || prior) per vote source
    if (this.beliefNetwork !== null && priorSnapshot !== null) {
      const posteriorSnapshot = this.beliefNetwork.getState().posteriors
      // Group votes by source agent to measure per-agent surprise
      const votesBySource = new Map<string, boolean>()
      for (const signal of newSignals) {
        if (isVotePayload(signal.payload)) {
          votesBySource.set(signal.source, true)
        }
      }
      for (const agentId of votesBySource.keys()) {
        this.surprise.measure(agentId, priorSnapshot, posteriorSnapshot)
      }
    }

    // Use Bayesian posteriors for entropy instead of raw confidence
    if (this.beliefNetwork !== null) {
      const state = this.beliefNetwork.getState()
      this.entropy.setDistribution(state.posteriors)
    } else if (allProposals.length > 0) {
      // Fallback: raw proposal confidences
      const dist = new Map<string, number>()
      for (const p of allProposals) {
        const key = extractProposalId(p)
        dist.set(key, (dist.get(key) ?? 0) + p.confidence)
      }
      this.entropy.setDistribution(dist)
    } else {
      // Last resort: build distribution from discovery signals by source agent.
      // This ensures info-gain is computed even when agents only emit discoveries
      // (common in observer/analysis use cases with no proposal voting).
      const discoveries = newSignals.filter(
        (s) => s.type === 'discovery' || s.type === 'challenge' || s.type === 'doubt',
      )
      if (discoveries.length > 0) {
        const dist = new Map<string, number>()
        for (const d of discoveries) {
          dist.set(d.source, (dist.get(d.source) ?? 0) + d.confidence)
        }
        this.entropy.setDistribution(dist)
      }
    }

    this._roundNumber++

    // Finalize surprise measurements for this round
    // Capture per-signal surprise values before endRound() clears them
    const surpriseReport = this.surprise.endRound()
    const roundSurpriseValues = surpriseReport.measurements.map((m) => m.surprise)

    // ── Pipeline: surprise → free energy → fisher → belief distance ──

    if (this.beliefNetwork !== null) {
      const posteriors = this.beliefNetwork.getState().posteriors
      const mapProb = this.beliefNetwork.mapEstimate().probability

      // Set uniform prior on first round (before any updates shifted it)
      if (this._roundNumber === 1) {
        const uniform = new Map<string, number>()
        for (const key of posteriors.keys()) {
          uniform.set(key, 1 / posteriors.size)
        }
        this.freeEnergy.setPrior(uniform)
      }

      // Free Energy: F = λ·KL(posterior || prior) - log(accuracy)
      // accuracy = MAP estimate probability (how well best hypothesis explains task)
      this.freeEnergy.observeRound(posteriors, mapProb)

      // Phase Transition: order parameter (MAP prob) + per-signal surprise values
      this.phaseDetector.observeRound(mapProb, roundSurpriseValues)

      // Fisher: track posterior evolution for Cramér-Rao efficiency
      this.fisher.observeRound(posteriors)

      // Belief Distance: track per-agent beliefs for Wasserstein clustering
      // Feed each agent's individual vote stance as a belief proxy
      for (const signal of newSignals) {
        if (isVotePayload(signal.payload)) {
          const agentBelief = new Map(posteriors)
          // Weight the voted proposal higher for this agent
          const voted = signal.payload.proposalId
          if (agentBelief.has(voted)) {
            const weight = signal.payload.stance === 'agree'
              ? signal.confidence
              : 1 - signal.confidence
            const adjusted = new Map<string, number>()
            let total = 0
            for (const [id, prob] of agentBelief) {
              const adj = id === voted
                ? prob * (1 + weight)
                : prob * (1 - weight * 0.2)
              adjusted.set(id, Math.max(adj, 1e-10))
              total += Math.max(adj, 1e-10)
            }
            // Renormalize
            for (const [id, val] of adjusted) {
              adjusted.set(id, val / total)
            }
            this.beliefDistance.setBeliefs(signal.source, adjusted)
          }
        }
      }
    }

    for (const p of allProposals) {
      const proposalId = extractProposalId(p)
      this.opinionDynamics.setOpinion(
        p.source,
        p.confidence,
        0.1 + 0.5 * 0.5, // default conformity mapping
      )
      // Track per-proposal opinion
      this.opinionDynamics.setOpinion(
        `${p.source}:${proposalId}`,
        p.confidence,
      )
    }

    for (const signal of newSignals) {
      const payload = signal.payload
      if (isVotePayload(payload)) {
        const proposer = allProposals.find(
          (p) => extractProposalId(p) === payload.proposalId,
        )
        if (proposer) {
          const weight = payload.stance === 'agree' ? 1.0 : -0.5
          this.influenceGraph.addEdge({
            from: proposer.source,
            to: signal.source,
            weight: weight * signal.confidence,
          })
        }
      }
    }

    this.updateReplicator(newSignals)

    if (this.optimalStopping !== null) {
      const gain = this.entropy.informationGain()
      const mapProb = this.beliefNetwork?.mapEstimate().probability ?? 0
      this.optimalStopping.observeRound({
        informationGain: gain.gain,
        bestProposalQuality: mapProb,
        round: this._roundNumber,
      })
    }
  }

  /**
   * Check if the swarm should stop based on math criteria.
   *
   * Hierarchy:
   *   1. FREE ENERGY (primary) — unified criterion: ΔF ≈ 0 means nothing left to learn
   *   2. FISHER (secondary) — learning efficiency stalled: signals aren't helping
   *   3. Fallbacks — entropy, info gain, cycles, CUSUM, surprise, fragmentation
   */
  shouldStop(): boolean {
    // ── PRIMARY: Free Energy convergence ──
    // F encapsulates entropy + surprise + accuracy into one scalar.
    // When |ΔF| < ε for N consecutive rounds, the swarm has learned
    // everything it can from the available signals.
    if (this.freeEnergy.roundCount >= MIN_ROUNDS_FOR_FREE_ENERGY) {
      if (this.freeEnergy.shouldStop()) {
        this.stoppingReason = 'free-energy-converged'
        return true
      }
    }

    // ── SECONDARY: Fisher learning stalled ──
    // Even if F hasn't converged, if learning efficiency is persistently
    // below 0.3, signals are too correlated or uninformative.
    if (this.fisher.roundCount >= MIN_ROUNDS_FOR_FISHER) {
      const fisherReport = this.fisher.report()
      if (fisherReport.learningStalled) {
        this.stoppingReason = 'learning-stalled'
        return true
      }
    }

    // ── FALLBACKS ──
    // These catch edge cases that F might miss (e.g., F not initialized
    // because no belief network exists, or pathological cycle patterns).

    // Entropy convergence
    if (this.entropy.roundCount >= MIN_ROUNDS_FOR_ENTROPY) {
      if (
        !this.entropy.shouldContinueNormalized(this.config.entropyThreshold)
      ) {
        this.stoppingReason = 'entropy-converged'
        return true
      }
    }

    // Information gain exhausted
    if (this.entropy.roundCount >= MIN_ROUNDS_FOR_GAIN) {
      const gain = this.entropy.informationGain()
      if (gain.relativeGain < this.config.minInformationGain) {
        this.stoppingReason = 'information-gain-exhausted'
        return true
      }
    }

    // Cycle detection (only after enough rounds + transitions)
    if (
      this._roundNumber >= MIN_ROUNDS_FOR_CYCLES &&
      this.markov.transitionCount >= MIN_TRANSITIONS_FOR_MARKOV
    ) {
      const cycles = this.markov.detectCycles(CYCLE_MASS_THRESHOLD)
      if (cycles.detected && !isNormalCycle(cycles.states)) {
        this.stoppingReason = 'cycle-detected'
        return true
      }
    }

    // CUSUM change detection / Secretary Problem
    if (this.optimalStopping !== null && this._roundNumber >= MIN_ROUNDS_FOR_GAIN) {
      const decision = this.optimalStopping.decide()
      if (decision.shouldStop) {
        this.stoppingReason = decision.reason === 'cusum-change-detected'
          ? 'cusum-change-detected'
          : 'secretary-threshold'
        return true
      }
    }

    // Surprise collapse (echo chamber / no new information)
    if (this.surprise.roundCount >= 5) {
      const report = this.surprise.roundReport()
      if (report.surpriseCollapse) {
        this.stoppingReason = 'surprise-collapsed'
        return true
      }
    }

    // OpinionDynamics fragmentation prediction
    if (this.opinionDynamics.agentCount >= 3 && this._roundNumber >= 2) {
      const prediction = this.opinionDynamics.predict()
      if (prediction.fragmentationRisk === 'high' && prediction.clusterCount >= 3) {
        this.stoppingReason = 'fragmentation-predicted'
        return true
      }
    }

    return false
  }

  /** Current entropy analysis for streaming events. */
  currentEntropy(): {
    entropy: number
    normalized: number
    informationGain: number
  } {
    const analysis = this.entropy.analyze()
    const gain = this.entropy.informationGain()
    return {
      entropy: analysis.entropy,
      normalized: analysis.normalized,
      informationGain: gain.gain,
    }
  }

  /** Generate the full math analysis report. */
  analyze(): MathAnalysis {
    const entropyAnalysis = this.entropy.analyze()
    const gain = this.entropy.informationGain()
    const history = this.entropy.getHistory()

    return {
      entropy: {
        final: entropyAnalysis.entropy,
        normalized: entropyAnalysis.normalized,
        history: [...history],
      },
      informationGain: {
        total:
          history.length >= 2
            ? Math.max(0, history[0]! - history[history.length - 1]!)
            : 0,
        perRound: this.entropy.averageGainPerRound(),
        lastRound: gain.gain,
      },
      redundancy:
        this.redundancy.emissionCount >= 2
          ? buildRedundancyAnalysis(
              this.redundancy,
              this.config.redundancyThreshold,
            )
          : null,
      markov:
        this.markov.transitionCount >= 2
          ? buildMarkovAnalysis(this.markov)
          : null,
      bayesian: this.buildBayesianAnalysis(),
      gameTheory: this.buildGameTheoryAnalysis(),
      opinionDynamics: this.buildOpinionDynamicsAnalysis(),
      replicatorDynamics: this.buildReplicatorAnalysis(),
      influence: this.buildInfluenceAnalysis(),
      optimalStopping: this.buildOptimalStoppingAnalysis(),
      shapley: this.buildShapleyAnalysis(),
      surprise: this.buildSurpriseAnalysis(),
      freeEnergy: this.buildFreeEnergyAnalysis(),
      fisher: this.buildFisherAnalysis(),
      beliefDistance: this.buildBeliefDistanceAnalysis(),
      phaseTransition: this.buildPhaseTransitionAnalysis(),
      stoppingReason: this.stoppingReason,
    }
  }

  /** Reset all state for a new solve() call. */
  reset(): void {
    this.entropy.reset()
    this.redundancy.reset()
    this.markov.reset()
    this.opinionDynamics.reset()
    this.influenceGraph.reset()
    this.surprise.reset()
    this.freeEnergy.reset()
    this.fisher.reset()
    this.beliefDistance.reset()
    this.phaseDetector.reset()
    this.replicatorDynamics = null
    this.optimalStopping?.reset()
    this.beliefNetwork = null
    this.knownProposalIds.clear()
    this.strategyEmissions.clear()
    this.strategyFitness.clear()
    this.agentSignalCounts.clear()
    this.stoppingReason = null
    this.lastSignalType = null
    this.challengeCount = 0
    this._roundNumber = 0
  }

  private updateBeliefs(
    allProposals: readonly Signal[],
    allVotes: readonly Signal[],
  ): void {
    const proposalIds: string[] = []
    for (const p of allProposals) {
      const id = extractProposalId(p)
      if (!this.knownProposalIds.has(id)) {
        proposalIds.push(id)
        this.knownProposalIds.add(id)
      }
    }

    if (proposalIds.length > 0) {
      if (this.beliefNetwork === null) {
        this.beliefNetwork = new BeliefNetwork([...this.knownProposalIds])
      } else {
        for (const id of proposalIds) {
          this.beliefNetwork.addHypothesis(
            id,
            1 / (this.knownProposalIds.size + 1),
          )
        }
      }
    }

    if (this.beliefNetwork === null) return

    for (const voteSignal of allVotes) {
      if (!isVotePayload(voteSignal.payload)) continue

      const { proposalId, stance, weight } = voteSignal.payload
      if (!this.knownProposalIds.has(proposalId)) continue

      const likelihoodRatio = voteToLikelihoodRatio(stance, weight)
      this.beliefNetwork.update({
        hypothesisId: proposalId,
        likelihoodRatio,
        weight: voteSignal.confidence,
      })
    }
  }

  private buildBayesianAnalysis(): MathAnalysis['bayesian'] {
    if (this.beliefNetwork === null) {
      return {
        mapEstimate: null,
        posteriors: {},
        evidenceCount: 0,
      }
    }

    const state = this.beliefNetwork.getState()
    const map = this.beliefNetwork.mapEstimate()

    const posteriors: Record<string, number> = {}
    for (const [id, prob] of state.posteriors) {
      posteriors[id] = prob
    }

    return {
      mapEstimate:
        map.hypothesisId !== ''
          ? { proposalId: map.hypothesisId, probability: map.probability }
          : null,
      posteriors,
      evidenceCount: state.evidenceCount,
    }
  }

  private buildGameTheoryAnalysis(): MathAnalysis['gameTheory'] {
    if (this.agentCount < 2) return null

    let groupConsensus = 0
    if (this.beliefNetwork !== null) {
      const map = this.beliefNetwork.mapEstimate()
      groupConsensus = map.probability
    }

    // Default moderate belief since we lack per-agent data
    const beliefs = new Array<number>(this.agentCount).fill(0.6)
    const expectedChallengers = this.gameTheory.expectedChallengers(
      beliefs,
      groupConsensus,
    )

    const challengeDeficit = expectedChallengers - this.challengeCount
    let groupthinkRisk: 'low' | 'medium' | 'high' = 'low'
    if (challengeDeficit > this.agentCount * 0.5) {
      groupthinkRisk = 'high'
    } else if (challengeDeficit > this.agentCount * 0.25) {
      groupthinkRisk = 'medium'
    }

    return {
      expectedChallengers,
      actualChallengers: this.challengeCount,
      groupthinkRisk,
    }
  }

  private buildOpinionDynamicsAnalysis(): MathAnalysis['opinionDynamics'] {
    if (this.opinionDynamics.agentCount < 2) return null

    const prediction = this.opinionDynamics.predict()
    return {
      clusterCount: prediction.clusterCount,
      polarizationIndex: prediction.polarizationIndex,
      fragmentationRisk: prediction.fragmentationRisk,
      bridgingAgents: prediction.bridgingAgents,
    }
  }

  private buildReplicatorAnalysis(): MathAnalysis['replicatorDynamics'] {
    if (this.replicatorDynamics === null) return null

    const report = this.replicatorDynamics.analyze()
    return {
      dominantStrategy: report.dominantStrategy,
      convergenceToESS: report.convergenceToESS,
      suggestedShifts: report.suggestedShifts.map((s) => ({
        strategy: s.strategy,
        direction: s.direction,
        magnitude: s.magnitude,
      })),
    }
  }

  private buildInfluenceAnalysis(): MathAnalysis['influence'] {
    if (this.influenceGraph.edgeCount < 2) return null

    const report = this.influenceGraph.analyze()
    return {
      dominantInfluencer: report.dominantInfluencer,
      influenceConcentration: report.influenceConcentration,
      fiedlerValue: report.fiedlerValue,
      isFragile: report.isFragile,
      isolatedAgents: report.isolatedAgents,
    }
  }

  private buildShapleyAnalysis(): MathAnalysis['shapley'] {
    if (this.agentSignalCounts.size < 2) return null

    const agents = [...this.agentSignalCounts.keys()]
    const sv = new ShapleyValuator(agents)

    // Coalition value = fraction of total signal volume.
    // Agents emitting the same signal types are redundant in Shapley terms.
    const totalSignals = [...this.agentSignalCounts.values()].reduce(
      (a, b) => a + b,
      0,
    )

    sv.setValueFunction((coalition) => {
      if (coalition.length === 0) return 0
      let coalitionSignals = 0
      for (const agent of coalition) {
        coalitionSignals += this.agentSignalCounts.get(agent) ?? 0
      }
      return coalitionSignals / totalSignals
    })

    const result = agents.length <= 15
      ? sv.computeExact()
      : sv.computeApproximate()

    const values: Record<string, number> = {}
    for (const [agent, value] of result.values) {
      values[agent] = value
    }

    const redundant = sv.findRedundant(
      1 / (agents.length * 2), // agents contributing less than half-fair-share
    )

    const topContributors = sv.optimalCoalition(
      Math.max(1, Math.ceil(agents.length * 0.5)),
    )

    return {
      values,
      redundantAgents: [...redundant],
      topContributors: [...topContributors],
    }
  }

  private buildOptimalStoppingAnalysis(): MathAnalysis['optimalStopping'] {
    if (this.optimalStopping === null) return null

    return {
      cusumStatistic: this.optimalStopping.cusumValue(),
      explorationComplete: this.optimalStopping.isExplorationComplete(),
      changeDetected: this.optimalStopping.isChangeDetected(),
    }
  }

  private buildSurpriseAnalysis(): MathAnalysis['surprise'] {
    if (this.surprise.roundCount < 1) return null

    const report = this.surprise.roundReport()
    return {
      meanSurprise: report.meanSurprise,
      trend: report.trend,
      collapsed: report.surpriseCollapse,
      mostInformativeAgent: report.mostInformativeAgent,
      leastInformativeAgent: report.leastInformativeAgent,
      history: [...this.surprise.getHistory()],
    }
  }

  private buildFreeEnergyAnalysis(): MathAnalysis['freeEnergy'] {
    if (this.freeEnergy.roundCount < 1) return null

    const report = this.freeEnergy.report()
    return {
      current: report.current.freeEnergy,
      deltaF: report.current.deltaF,
      descentRate: report.descentRate,
      converged: report.converged,
      recommendation: {
        action: report.recommendation.action,
        rationale: report.recommendation.rationale,
      },
      learningHealth: report.learningHealth,
      dominantComponent: report.dominantComponent,
      history: report.history.map((s) => s.freeEnergy),
    }
  }

  private buildFisherAnalysis(): MathAnalysis['fisher'] {
    if (this.fisher.roundCount < 2) return null

    const report = this.fisher.report()
    return {
      overallEfficiency: report.overallEfficiency,
      learningStalled: report.learningStalled,
      recommendation: report.recommendation,
      trend: report.trend,
      history: [...report.history],
    }
  }

  private buildPhaseTransitionAnalysis(): MathAnalysis['phaseTransition'] {
    if (this.phaseDetector.roundCount < 2) return null

    const report = this.phaseDetector.report()
    return {
      phase: report.state.phase,
      orderParameter: report.state.orderParameter,
      susceptibility: report.state.susceptibility,
      criticalityScore: report.state.criticalityScore,
      scaleFreeSignature: report.state.scaleFreeSignature,
      control: {
        action: report.control.action,
        intensity: report.control.intensity,
        explorationMultiplier: report.control.explorationMultiplier,
        rationale: report.control.rationale,
      },
    }
  }

  private buildBeliefDistanceAnalysis(): MathAnalysis['beliefDistance'] {
    if (this.beliefDistance.agentCount < 2) return null

    const clusters = this.beliefDistance.clusterAgents(BELIEF_CLUSTER_THRESHOLD)
    const distances = this.beliefDistance.pairwiseDistances()
    const meanDistance = distances.length > 0
      ? distances.reduce((sum, d) => sum + d.distance, 0) / distances.length
      : 0

    const consensus = this.beliefDistance.optimalConsensus()
    const optimalConsensus: Record<string, number> = {}
    for (const [id, prob] of consensus.distribution) {
      optimalConsensus[id] = prob
    }

    return {
      clusterCount: clusters.length,
      clusters,
      optimalConsensus,
      meanDistance,
    }
  }

  /**
   * Get the attention weight for an agent based on surprise history.
   * Use this to amplify signals from consistently informative agents.
   */
  getAgentAttentionWeight(agentId: string): number {
    return this.surprise.agentAttentionWeight(agentId)
  }

  /**
   * Produce control signals from math analysis for the orchestrator.
   *
   * This is the FEEDBACK LOOP — the bridge between passive measurement
   * and active swarm modulation. The orchestrator consumes these signals
   * to adjust agent selection, vote weighting, and signal injection.
   *
   * Called each round AFTER processRound(). The orchestrator uses the
   * returned signals to modulate behavior BEFORE the next round.
   */
  getControlSignals(): SwarmControlSignals {
    // Attention weights from surprise history
    const attentionWeights: Record<string, number> = {}
    for (const agentId of this.agentSignalCounts.keys()) {
      attentionWeights[agentId] = this.surprise.agentAttentionWeight(agentId)
    }

    // Exploration multiplier from phase detector
    const phaseControl = this.phaseDetector.recommend()
    const explorationMultiplier = phaseControl.explorationMultiplier

    // Free energy recommendation
    const feReport = this.freeEnergy.roundCount > 0
      ? this.freeEnergy.report()
      : null
    const freeEnergyAction = feReport?.recommendation.action ?? 'exploit'
    const challengeTarget = feReport?.recommendation.target ?? null

    // Should we inject a challenge?
    // Yes if: phase detector says inject-challenge OR free energy says challenge
    const shouldInjectChallenge =
      phaseControl.action === 'inject-challenge' ||
      freeEnergyAction === 'challenge'

    // Learning health
    const learningHealth = feReport?.learningHealth ?? 'good'

    // Phase
    const phase = this.phaseDetector.roundCount >= 2
      ? this.phaseDetector.detect().phase
      : 'disordered'

    return {
      attentionWeights,
      explorationMultiplier,
      freeEnergyAction,
      shouldInjectChallenge,
      challengeTarget,
      learningHealth,
      phase,
    }
  }

  /**
   * Track signal types as strategies for replicator dynamics.
   * Maps signal type -> strategy, counts per round, and computes
   * fitness from information gain contribution.
   */
  private updateReplicator(newSignals: readonly Signal[]): void {
    if (newSignals.length === 0) return

    const typeCounts = new Map<string, number>()
    for (const signal of newSignals) {
      typeCounts.set(
        signal.type,
        (typeCounts.get(signal.type) ?? 0) + 1,
      )
    }

    const strategyTypes = [...new Set([
      ...this.strategyEmissions.keys(),
      ...typeCounts.keys(),
    ])]

    if (strategyTypes.length < 2) return

    if (this.replicatorDynamics === null) {
      this.replicatorDynamics = new ReplicatorDynamics(strategyTypes)
    }

    const total = newSignals.length
    const frequencies = new Map<string, number>()
    for (const s of strategyTypes) {
      frequencies.set(s, (typeCounts.get(s) ?? 0) / total)
    }

    // Inverse frequency fitness: rare types get higher fitness (self-correcting)
    const fitness = new Map<string, number>()
    for (const s of strategyTypes) {
      const freq = frequencies.get(s) ?? 0
      fitness.set(s, freq > 0 ? 1 / (freq * strategyTypes.length) : 0)
    }

    this.replicatorDynamics.observeRound(frequencies, fitness)
  }
}

function extractProposalId(signal: Signal): string {
  const payload = signal.payload
  if (
    typeof payload === 'object' &&
    payload !== null &&
    'proposalId' in payload &&
    typeof payload.proposalId === 'string'
  ) {
    return payload.proposalId
  }
  return signal.id
}

function isVotePayload(
  payload: Signal['payload'],
): payload is {
  proposalId: string
  stance: 'agree' | 'disagree' | 'abstain'
  weight: number
  reasoning?: string
} {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    'proposalId' in payload &&
    'stance' in payload &&
    'weight' in payload
  )
}

function buildRedundancyAnalysis(
  detector: RedundancyDetector,
  threshold: number,
): MathAnalysis['redundancy'] {
  const report = detector.analyze(threshold)
  const avgNMI =
    report.pairwise.length > 0
      ? report.pairwise.reduce((sum, p) => sum + p.normalized, 0) /
        report.pairwise.length
      : 0

  return {
    averageNMI: avgNMI,
    redundantAgents: [...report.redundant],
    mostUniqueAgent: report.mostUnique,
  }
}

/**
 * Check if detected cycle states represent normal deliberation flow.
 * proposal↔vote, discovery↔proposal, challenge↔proposal are all healthy patterns.
 */
function isNormalCycle(states: readonly string[]): boolean {
  const normalStates = new Set(['proposal', 'vote', 'discovery', 'challenge'])
  return states.every((s) => normalStates.has(s))
}

function buildMarkovAnalysis(
  chain: MarkovChain,
): MathAnalysis['markov'] {
  const stationary = chain.computeStationaryDistribution()

  let dominantState: string | undefined
  let maxProb = 0
  for (const [state, prob] of stationary) {
    if (prob > maxProb) {
      maxProb = prob
      dominantState = state
    }
  }

  const cycles = chain.detectCycles(0.5)

  return {
    dominantState,
    cyclesDetected: cycles.detected,
    cycleStates: [...cycles.states],
  }
}
