import type { AgentContribution, AgentReaction } from '@cognitive-swarm/core'

interface MutableContribution {
  signalsEmitted: number
  proposalsMade: number
  challengesMade: number
  votesCast: number
  totalConfidence: number
  reactionCount: number
}

/**
 * Accumulates AgentContribution stats from agent reactions.
 */
export class ContributionTracker {
  private readonly data = new Map<string, MutableContribution>()

  /** Record an agent's reaction. */
  recordReaction(reaction: AgentReaction): void {
    const entry = this.getOrCreate(reaction.agentId)
    entry.reactionCount++

    for (const signal of reaction.signals) {
      entry.signalsEmitted++
      entry.totalConfidence += signal.confidence

      switch (signal.type) {
        case 'proposal':
          entry.proposalsMade++
          break
        case 'challenge':
          entry.challengesMade++
          break
        case 'vote':
          entry.votesCast++
          break
      }
    }
  }

  /** Finalized contributions for all agents. */
  getContributions(): ReadonlyMap<string, AgentContribution> {
    const result = new Map<string, AgentContribution>()

    for (const [agentId, entry] of this.data) {
      result.set(agentId, {
        agentId,
        signalsEmitted: entry.signalsEmitted,
        proposalsMade: entry.proposalsMade,
        challengesMade: entry.challengesMade,
        votesCast: entry.votesCast,
        avgConfidence:
          entry.signalsEmitted > 0
            ? entry.totalConfidence / entry.signalsEmitted
            : 0,
      })
    }

    return result
  }

  /** Reset all state. */
  reset(): void {
    this.data.clear()
  }

  private getOrCreate(agentId: string): MutableContribution {
    let entry = this.data.get(agentId)
    if (!entry) {
      entry = {
        signalsEmitted: 0,
        proposalsMade: 0,
        challengesMade: 0,
        votesCast: 0,
        totalConfidence: 0,
        reactionCount: 0,
      }
      this.data.set(agentId, entry)
    }
    return entry
  }
}
