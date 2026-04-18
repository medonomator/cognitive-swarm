// Shannon entropy: H(X) = -Sum p(x_i) * log2(p(x_i))
// Used as stopping criterion - stop when uncertainty is sufficiently low.

/** Result of an entropy calculation. */
export interface EntropyResult {
  /** Shannon entropy in bits. */
  readonly entropy: number
  /** Maximum possible entropy for this distribution (log₂N). */
  readonly maxEntropy: number
  /** Normalized entropy: entropy / maxEntropy ∈ [0, 1]. */
  readonly normalized: number
  /** Number of hypotheses in the distribution. */
  readonly hypothesisCount: number
}

/** Information gain between two entropy measurements. */
export interface InformationGain {
  /** Entropy before the evidence. */
  readonly before: number
  /** Entropy after the evidence. */
  readonly after: number
  /** Absolute entropy change |before - after| in bits. */
  readonly gain: number
  /** Relative gain: gain / before ∈ [0, 1]. */
  readonly relativeGain: number
}

/**
 * Tracks Shannon entropy of a hypothesis distribution over time.
 * Provides information-theoretic stopping criteria for the swarm.
 *
 * Usage:
 * ```ts
 * const tracker = new EntropyTracker()
 * tracker.setDistribution(new Map([['A', 0.25], ['B', 0.25], ['C', 0.25], ['D', 0.25]]))
 * tracker.entropy  // 2.0 bits (max uncertainty for 4 options)
 *
 * tracker.setDistribution(new Map([['A', 0.7], ['B', 0.1], ['C', 0.1], ['D', 0.1]]))
 * tracker.entropy  // ~1.36 bits (converging on A)
 *
 * tracker.shouldContinue(0.5)  // true - still above threshold
 * tracker.informationGain()     // { gain: 0.64, ... }
 * ```
 */
export class EntropyTracker {
  private history: number[] = []
  private currentDistribution: ReadonlyMap<string, number> = new Map()

  /**
   * Set the current probability distribution over hypotheses.
   * Probabilities should sum to ~1 (will be normalized if not).
   */
  setDistribution(distribution: ReadonlyMap<string, number>): void {
    this.currentDistribution = distribution
    this.history.push(this.entropy)
  }

  /** Current Shannon entropy in bits. */
  get entropy(): number {
    return shannonEntropy(this.currentDistribution)
  }

  /** Full entropy analysis of the current distribution. */
  analyze(): EntropyResult {
    const n = this.currentDistribution.size
    const h = shannonEntropy(this.currentDistribution)
    const maxH = n > 1 ? Math.log2(n) : 0

    return {
      entropy: h,
      maxEntropy: maxH,
      normalized: maxH > 0 ? h / maxH : 0,
      hypothesisCount: n,
    }
  }

  /**
   * Should the swarm continue deliberating?
   * Returns true if entropy is above the threshold (still uncertain).
   *
   * @param threshold - entropy in bits below which we consider converged
   */
  shouldContinue(threshold: number): boolean {
    return this.entropy > threshold
  }

  /**
   * Should the swarm continue based on normalized entropy?
   * Normalized entropy ∈ [0, 1] is independent of hypothesis count.
   *
   * @param threshold - normalized entropy below which we consider converged (e.g., 0.3)
   */
  shouldContinueNormalized(threshold: number): boolean {
    const analysis = this.analyze()
    return analysis.normalized > threshold
  }

  /**
   * Information gain from the last distribution update.
   * Measures how much the entropy changed (in either direction).
   * Both convergence (entropy ↓) and divergence (entropy ↑ from new
   * discoveries) represent information — a stagnant swarm has gain ≈ 0.
   */
  informationGain(): InformationGain {
    if (this.history.length < 2) {
      const current = this.entropy
      return {
        before: current,
        after: current,
        gain: 0,
        relativeGain: 0,
      }
    }

    const before = this.history[this.history.length - 2]!
    const after = this.history[this.history.length - 1]!
    const gain = Math.abs(before - after)

    return {
      before,
      after,
      gain,
      relativeGain: before > 0 ? gain / before : (after > 0 ? 1 : 0),
    }
  }

  /**
   * Average information gain per round.
   * Uses absolute entropy change per round — if this is very low,
   * the swarm is stuck (entropy neither rising nor falling) and should stop.
   */
  averageGainPerRound(): number {
    if (this.history.length < 2) return 0

    let totalAbsChange = 0
    for (let i = 1; i < this.history.length; i++) {
      totalAbsChange += Math.abs(this.history[i]! - this.history[i - 1]!)
    }
    return totalAbsChange / (this.history.length - 1)
  }

  /**
   * Predict how many more rounds are needed to reach target entropy.
   * Based on average gain per round (linear extrapolation).
   * Returns Infinity if average gain is zero or negative.
   */
  predictRoundsToConverge(targetEntropy: number): number {
    const avgGain = this.averageGainPerRound()
    if (avgGain <= 0) return Infinity

    const remaining = this.entropy - targetEntropy
    if (remaining <= 0) return 0

    return Math.ceil(remaining / avgGain)
  }

  /** Full entropy history across all updates. */
  getHistory(): readonly number[] {
    return this.history
  }

  /** Number of distribution updates recorded. */
  get roundCount(): number {
    return this.history.length
  }

  /** Reset all state. */
  reset(): void {
    this.history = []
    this.currentDistribution = new Map()
  }
}

/**
 * Compute Shannon entropy of a probability distribution.
 * H = -Σ p_i × log₂(p_i)
 *
 * Handles edge cases:
 * - p=0 terms contribute 0 (lim p->0 of p*log(p) = 0)
 * - Normalizes if probabilities don't sum to 1
 */
export function shannonEntropy(
  distribution: ReadonlyMap<string, number>,
): number {
  if (distribution.size === 0) return 0

  // Normalize
  let sum = 0
  for (const p of distribution.values()) {
    sum += p
  }
  if (sum === 0) return 0

  let h = 0
  for (const p of distribution.values()) {
    const normalized = p / sum
    if (normalized > 0) {
      h -= normalized * Math.log2(normalized)
    }
  }

  return h
}

/**
 * Compute KL divergence: D_KL(P || Q) = Σ p_i × log₂(p_i / q_i)
 *
 * Measures how much distribution P diverges from reference Q.
 * Always ≥ 0, equals 0 only when P = Q.
 *
 * Used to measure how much beliefs have shifted between rounds.
 */
export function klDivergence(
  p: ReadonlyMap<string, number>,
  q: ReadonlyMap<string, number>,
): number {
  // Normalize both
  let sumP = 0
  let sumQ = 0
  for (const v of p.values()) sumP += v
  for (const v of q.values()) sumQ += v

  if (sumP === 0 || sumQ === 0) return Infinity

  let dkl = 0
  for (const [key, pVal] of p) {
    const pNorm = pVal / sumP
    const qVal = q.get(key) ?? 0
    const qNorm = qVal / sumQ

    if (pNorm > 0) {
      if (qNorm === 0) return Infinity // P assigns mass where Q doesn't
      dkl += pNorm * Math.log2(pNorm / qNorm)
    }
  }

  return dkl
}

/**
 * Jensen-Shannon divergence: JSD(P, Q) = (D_KL(P||M) + D_KL(Q||M)) / 2
 * where M = (P + Q) / 2.
 *
 * Symmetric, bounded [0, 1] (in bits), always finite.
 * Better than KL for comparing two distributions.
 */
export function jsDivergence(
  p: ReadonlyMap<string, number>,
  q: ReadonlyMap<string, number>,
): number {
  // Build midpoint distribution M = (P + Q) / 2
  const m = new Map<string, number>()
  const allKeys = new Set([...p.keys(), ...q.keys()])

  // Normalize both
  let sumP = 0
  let sumQ = 0
  for (const v of p.values()) sumP += v
  for (const v of q.values()) sumQ += v
  if (sumP === 0 && sumQ === 0) return 0

  for (const key of allKeys) {
    const pNorm = sumP > 0 ? (p.get(key) ?? 0) / sumP : 0
    const qNorm = sumQ > 0 ? (q.get(key) ?? 0) / sumQ : 0
    m.set(key, (pNorm + qNorm) / 2)
  }

  // Rebuild normalized p and q maps
  const pNormMap = new Map<string, number>()
  const qNormMap = new Map<string, number>()
  for (const key of allKeys) {
    pNormMap.set(key, sumP > 0 ? (p.get(key) ?? 0) / sumP : 0)
    qNormMap.set(key, sumQ > 0 ? (q.get(key) ?? 0) / sumQ : 0)
  }

  return (klDivergence(pNormMap, m) + klDivergence(qNormMap, m)) / 2
}
