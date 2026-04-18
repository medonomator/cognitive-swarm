import type {
  Signal,
  DebateResult,
  SwarmEventMap,
} from '@cognitive-swarm/core'
import type { TypedEventEmitter } from '@cognitive-swarm/core'
import { uid } from '@cognitive-engine/core'
import type { SwarmAgent } from '@cognitive-swarm/agent'
import type { SignalBus } from '@cognitive-swarm/signals'
import type { ContributionTracker } from './contribution-tracker.js'
import type { MathBridge } from './math-bridge.js'
import { RoundRunner } from './round-runner.js'

// When consensus fails with competing proposals, the debate protocol
// injects structured challenge signals and runs sub-rounds so agents
// can defend/attack each position. Bayesian posteriors track which
// proposal accumulates more evidence, and the debate ends when one
// proposal's posterior exceeds the convergence threshold.

/** Context needed to run a debate. */
export interface DebateContext {
  readonly proposalA: Signal
  readonly proposalB: Signal
  readonly agents: readonly SwarmAgent[]
  readonly signalBus: SignalBus
  readonly mathBridge: MathBridge
  readonly contributionTracker: ContributionTracker
  readonly events: TypedEventEmitter<SwarmEventMap> | null
  readonly disabledAgents?: ReadonlySet<string>
  readonly topology?: ReadonlyMap<string, ReadonlySet<string>>
  readonly maxRounds: number
  readonly convergenceThreshold: number
}

/** Default convergence threshold - one proposal must reach 80% posterior. */
const DEFAULT_CONVERGENCE_THRESHOLD = 0.8

/**
 * Runs structured adversarial debates between competing proposals.
 *
 * For each debate round:
 * 1. Injects challenge signals targeting each proposal
 * 2. Runs a normal round via RoundRunner (agents respond naturally)
 * 3. Feeds new signals to MathBridge for Bayesian belief updates
 * 4. Checks if one proposal's posterior exceeds the convergence threshold
 *
 * Stops early if convergence is reached or maxRounds is exhausted.
 */
export class DebateRunner {
  private readonly roundRunner = new RoundRunner()

  /**
   * Run a structured debate between two competing proposals.
   */
  async runDebate(context: DebateContext): Promise<DebateResult> {
    const {
      proposalA,
      proposalB,
      agents,
      signalBus,
      mathBridge,
      contributionTracker,
      events,
      disabledAgents,
      maxRounds,
      convergenceThreshold,
    } = context

    const proposalAId = extractProposalId(proposalA)
    const proposalBId = extractProposalId(proposalB)

    events?.emit('debate:start', {
      proposalA: proposalAId ?? proposalA.id,
      proposalB: proposalBId ?? proposalB.id,
    })

    const allDebateSignals: Signal[] = []
    let roundsUsed = 0

    for (let round = 0; round < maxRounds; round++) {
      roundsUsed = round + 1

      const challenges = this.createChallengeSignals(proposalA, proposalB, round)
      for (const challenge of challenges) {
        signalBus.publish(challenge)
        allDebateSignals.push(challenge)
      }

      const roundResult = await this.roundRunner.run({
        agents,
        pendingSignals: challenges,
        contributionTracker,
        events,
        disabledAgents,
        topology: context.topology,
      })

      for (const signal of roundResult.newSignals) {
        signalBus.publish(signal)
        allDebateSignals.push(signal)
      }

      const allProposals = signalBus.getHistory({ type: 'proposal' })
      const allVotes = signalBus.getHistory({ type: 'vote' })
      mathBridge.processRound(roundResult.newSignals, allProposals, allVotes)

      const convergence = this.checkConvergence(
        mathBridge,
        proposalAId,
        proposalBId,
        convergenceThreshold,
      )

      const posteriors = mathBridge.analyze().bayesian.posteriors
      events?.emit('debate:round', { round: roundsUsed, posteriors })

      if (convergence.resolved) {
        const result: DebateResult = {
          resolved: true,
          winningProposalId: convergence.winningProposalId,
          confidence: convergence.confidence,
          roundsUsed,
          signals: allDebateSignals,
        }
        events?.emit('debate:end', result)
        return result
      }
    }

    const result: DebateResult = {
      resolved: false,
      winningProposalId: null,
      confidence: 0,
      roundsUsed,
      signals: allDebateSignals,
    }
    events?.emit('debate:end', result)
    return result
  }

  /**
   * Create challenge signals targeting each proposal.
   *
   * Each round generates two challenges (one per proposal) from
   * 'debate-moderator', prompting agents to examine weaknesses.
   */
  private createChallengeSignals(
    proposalA: Signal,
    proposalB: Signal,
    round: number,
  ): readonly Signal<'challenge'>[] {
    const contentA = extractProposalContent(proposalA)
    const contentB = extractProposalContent(proposalB)

    const challengeA: Signal<'challenge'> = {
      id: uid('sig'),
      type: 'challenge',
      source: 'debate-moderator',
      payload: {
        targetSignalId: proposalA.id,
        counterArgument: round === 0
          ? `Examine potential weaknesses in this approach: ${contentA}. What evidence would argue against it?`
          : `Previous arguments have not resolved this. Provide new evidence or reasoning against: ${contentA}`,
      },
      confidence: 0.9,
      timestamp: Date.now(),
      metadata: { round },
    }

    const challengeB: Signal<'challenge'> = {
      id: uid('sig'),
      type: 'challenge',
      source: 'debate-moderator',
      payload: {
        targetSignalId: proposalB.id,
        counterArgument: round === 0
          ? `Examine potential weaknesses in this approach: ${contentB}. What evidence would argue against it?`
          : `Previous arguments have not resolved this. Provide new evidence or reasoning against: ${contentB}`,
      },
      confidence: 0.9,
      timestamp: Date.now(),
      metadata: { round },
    }

    return [challengeA, challengeB]
  }

  /**
   * Check if Bayesian posteriors have converged on one proposal.
   *
   * Returns resolved=true if one proposal's posterior exceeds the threshold.
   */
  private checkConvergence(
    mathBridge: MathBridge,
    proposalAId: string | null,
    proposalBId: string | null,
    threshold: number,
  ): { resolved: boolean; winningProposalId: string | null; confidence: number } {
    const analysis = mathBridge.analyze()
    const posteriors = analysis.bayesian.posteriors

    // Check if MAP estimate exceeds threshold
    const mapEstimate = analysis.bayesian.mapEstimate
    if (mapEstimate && mapEstimate.probability >= threshold) {
      return {
        resolved: true,
        winningProposalId: mapEstimate.proposalId,
        confidence: mapEstimate.probability,
      }
    }

    // Check individual proposal posteriors
    if (proposalAId && posteriors[proposalAId] !== undefined && posteriors[proposalAId] >= threshold) {
      return {
        resolved: true,
        winningProposalId: proposalAId,
        confidence: posteriors[proposalAId],
      }
    }
    if (proposalBId && posteriors[proposalBId] !== undefined && posteriors[proposalBId] >= threshold) {
      return {
        resolved: true,
        winningProposalId: proposalBId,
        confidence: posteriors[proposalBId],
      }
    }

    return { resolved: false, winningProposalId: null, confidence: 0 }
  }
}

/** Default convergence threshold accessor for orchestrator. */
export { DEFAULT_CONVERGENCE_THRESHOLD }

function extractProposalId(signal: Signal): string | null {
  if (
    typeof signal.payload === 'object' &&
    signal.payload !== null &&
    'proposalId' in signal.payload
  ) {
    return String(signal.payload.proposalId)
  }
  return null
}

function extractProposalContent(signal: Signal): string {
  if (
    typeof signal.payload === 'object' &&
    signal.payload !== null &&
    'content' in signal.payload
  ) {
    return String(signal.payload.content)
  }
  return `[proposal ${signal.id}]`
}
