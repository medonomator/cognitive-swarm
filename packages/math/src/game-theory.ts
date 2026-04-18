// Game theory - strategic agree/challenge decisions.
// Key: when consensus is high, hero bonus increases,
// making devil's advocate emerge mathematically.

/** Payoff structure for the agree/challenge game. */
export interface PayoffConfig {
  /** Cost of agreeing when wrong (groupthink penalty). Default: 2.0 */
  readonly groupthinkCost: number
  /** Benefit of challenging when wrong (hero bonus). Default: 3.0 */
  readonly heroBonus: number
  /** Cost of challenging when right (disruption). Default: 1.0 */
  readonly disruptionCost: number
  /** How much group consensus amplifies the hero bonus. Default: 1.5 */
  readonly consensusAmplification: number
}

/** Result of a strategic decision computation. */
export interface StrategyDecision {
  /** Recommended action. */
  readonly action: 'agree' | 'challenge'
  /** Expected value of agreeing. */
  readonly agreeEV: number
  /** Expected value of challenging. */
  readonly challengeEV: number
  /** Margin: challengeEV - agreeEV. Positive = challenge is better. */
  readonly margin: number
  /** Probability of challenging in mixed strategy Nash equilibrium. */
  readonly challengeProbability: number
}

/** Input for a strategic decision. */
export interface StrategyContext {
  /** Agent's belief that the proposal is correct. ∈ [0, 1] */
  readonly belief: number
  /** Current group consensus level. ∈ [0, 1] (1 = unanimous agreement) */
  readonly groupConsensus: number
  /** Agent's reputation stake (higher = more to lose). ∈ [0, ∞) */
  readonly reputationStake: number
}

const DEFAULT_PAYOFFS: PayoffConfig = {
  groupthinkCost: 2.0,
  heroBonus: 3.0,
  disruptionCost: 1.0,
  consensusAmplification: 1.5,
}

/**
 * Computes the optimal strategy for an agent facing
 * the agree/challenge decision.
 *
 * The game-theoretic twist: when group consensus is high,
 * the hero bonus is amplified, making it more profitable
 * to challenge. This prevents groupthink mathematically.
 *
 * Usage:
 * ```ts
 * const game = new AgreeChallenge()
 *
 * // Agent is 60% sure proposal is right, group 90% agrees
 * const decision = game.decide({
 *   belief: 0.6,
 *   groupConsensus: 0.9,
 *   reputationStake: 1.0,
 * })
 * // decision.action === 'challenge'
 * // Because high consensus amplifies hero bonus
 * ```
 */
export class AgreeChallenge {
  private readonly payoffs: PayoffConfig

  constructor(payoffs?: Partial<PayoffConfig>) {
    this.payoffs = { ...DEFAULT_PAYOFFS, ...payoffs }
  }

  /**
   * Compute the optimal strategic decision.
   *
   * The key mechanism: hero bonus is amplified by group consensus.
   *   h_effective = h × (1 + amplification × g)
   *
   * When g is high (everyone agrees), h_effective is large,
   * making challenging more attractive - devil's advocate emerges.
   */
  decide(context: StrategyContext): StrategyDecision {
    const b = clamp01(context.belief)
    const g = clamp01(context.groupConsensus)

    // Consensus amplifies hero bonus
    const h =
      this.payoffs.heroBonus *
      (1 + this.payoffs.consensusAmplification * g)
    const c = this.payoffs.groupthinkCost
    const d =
      this.payoffs.disruptionCost *
      (1 + context.reputationStake * 0.5)

    // Expected values
    //   E[agree]     = b × 1 + (1-b) × (-c) = b + bc - c = b(1+c) - c
    //   E[challenge] = b × (-d) + (1-b) × h  = h - b(h+d)
    const agreeEV = b * (1 + c) - c
    const challengeEV = h - b * (h + d)

    const margin = challengeEV - agreeEV
    const action: 'agree' | 'challenge' = margin > 0 ? 'challenge' : 'agree'

    // Mixed strategy Nash equilibrium probability of challenging
    // At equilibrium, agent is indifferent: E[agree] = E[challenge]
    //   b*(1+c) - c = h - b*(h+d)
    //   b*(1+c+h+d) = h + c
    //   b* = (h+c) / (1+c+h+d)
    //
    // If actual b < b*, challenge is better -> P(challenge) = 1
    // If actual b > b*, agree is better -> P(challenge) = 0
    // At b = b*, any mix is optimal
    const bStar = (h + c) / (1 + c + h + d)
    const challengeProbability =
      b < bStar ? 1.0 : b > bStar ? 0.0 : 0.5

    return {
      action,
      agreeEV,
      challengeEV,
      margin,
      challengeProbability,
    }
  }

  /**
   * Compute the critical belief threshold b*.
   * Below b*, challenging is optimal. Above b*, agreeing is optimal.
   *
   *   b* = (h_eff + c) / (1 + c + h_eff + d_eff)
   */
  criticalBelief(groupConsensus: number, reputationStake = 1): number {
    const g = clamp01(groupConsensus)
    const h =
      this.payoffs.heroBonus *
      (1 + this.payoffs.consensusAmplification * g)
    const c = this.payoffs.groupthinkCost
    const d = this.payoffs.disruptionCost * (1 + reputationStake * 0.5)

    return (h + c) / (1 + c + h + d)
  }

  /**
   * For a group of N agents with given beliefs and consensus level,
   * compute how many would challenge in Nash equilibrium.
   */
  expectedChallengers(
    beliefs: readonly number[],
    groupConsensus: number,
    reputationStakes?: readonly number[],
  ): number {
    let challengers = 0
    for (let i = 0; i < beliefs.length; i++) {
      const stake = reputationStakes?.[i] ?? 1.0
      const decision = this.decide({
        belief: beliefs[i]!,
        groupConsensus,
        reputationStake: stake,
      })
      challengers += decision.challengeProbability
    }
    return challengers
  }
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x))
}
