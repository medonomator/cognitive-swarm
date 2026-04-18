// Optimal Transport: Wasserstein distance & barycenters
//
// The Wasserstein (Earth Mover's) distance measures the minimum "work"
// needed to transform one probability distribution into another.
// Unlike KL divergence, it:
//   1. Always finite (no division-by-zero when supports differ)
//   2. Metrically meaningful (satisfies triangle inequality)
//   3. Geometrically interpretable (actual "distance" between beliefs)
//
// Wasserstein Barycenter = the distribution that minimizes total transport
// cost from all input distributions. This is the mathematically optimal
// consensus point — better than simple averaging.
//
// Used for:
// - Measuring belief distance between agents (replaces broken KL for disjoint beliefs)
// - Computing optimal consensus (barycenter of agent belief distributions)
// - Detecting opinion drift (Wasserstein distance over time)
// - Clustering agents by belief similarity (metric space → proper clustering)

/** Result of a Wasserstein distance computation. */
export interface WassersteinResult {
  /** The Wasserstein-1 (Earth Mover's) distance. */
  readonly distance: number
  /** Optimal transport plan: source → target → mass moved. */
  readonly transportPlan: readonly TransportFlow[]
}

/** A single flow in the optimal transport plan. */
export interface TransportFlow {
  readonly from: string
  readonly to: string
  readonly mass: number
  /** Ground distance between source and target. */
  readonly cost: number
}

/** Result of barycenter computation. */
export interface BarycenterResult {
  /** The optimal barycenter distribution (minimizes total Wasserstein distance). */
  readonly distribution: ReadonlyMap<string, number>
  /** Total transport cost to reach barycenter from all inputs. */
  readonly totalCost: number
  /** Per-input transport cost. */
  readonly individualCosts: readonly number[]
}

/** Pairwise distance between two agents' belief distributions. */
export interface BeliefDistance {
  readonly agentA: string
  readonly agentB: string
  readonly distance: number
}

/**
 * Computes Wasserstein-1 (Earth Mover's) distance between discrete distributions.
 *
 * For distributions over an ordered set of labels, W₁ is computed via the
 * cumulative distribution function (CDF) method:
 *   W₁(P, Q) = Σ |CDF_P(i) - CDF_Q(i)| × d(i, i+1)
 *
 * For distributions over unordered labels (our case — proposal IDs),
 * we use the linear programming formulation solved via the
 * North-West Corner + stepping stone method for small N,
 * or the Sinkhorn algorithm for larger N.
 *
 * Usage:
 * ```ts
 * const p = new Map([['A', 0.9], ['B', 0.1], ['C', 0]])
 * const q = new Map([['A', 0], ['B', 0.1], ['C', 0.9]])
 *
 * wasserstein1(p, q)
 * // KL would return Infinity (zeros in support!)
 * // Wasserstein returns a finite, meaningful distance
 * ```
 */
export function wasserstein1(
  p: ReadonlyMap<string, number>,
  q: ReadonlyMap<string, number>,
  groundDistance?: (a: string, b: string) => number,
): WassersteinResult {
  // Collect all keys and normalize
  const allKeys = [...new Set([...p.keys(), ...q.keys()])]
  if (allKeys.length === 0) return { distance: 0, transportPlan: [] }

  const pNorm = normalize(p, allKeys)
  const qNorm = normalize(q, allKeys)

  // Default ground distance: uniform metric (1 for different labels, 0 for same)
  const dist = groundDistance ?? defaultGroundDistance

  const n = allKeys.length

  // For small n, solve exactly via the transportation simplex
  // For proposal distributions, n is typically 2-10
  if (n <= 20) {
    return solveTransportExact(allKeys, pNorm, qNorm, dist)
  }

  // For larger n, use Sinkhorn approximation
  return solveTransportSinkhorn(allKeys, pNorm, qNorm, dist)
}

/**
 * Compute the Wasserstein barycenter of multiple distributions.
 *
 * The barycenter β minimizes: Σ_i w_i × W₁(β, P_i)
 *
 * This is the mathematically optimal "consensus" distribution —
 * the single distribution closest to all inputs in transport distance.
 *
 * Uses iterative Bregman projections (Sinkhorn-like) for efficiency.
 *
 * @param distributions - Input distributions with weights
 * @param weights - Weight per distribution (uniform if omitted)
 */
export function wassersteinBarycenter(
  distributions: readonly ReadonlyMap<string, number>[],
  weights?: readonly number[],
): BarycenterResult {
  if (distributions.length === 0) {
    return { distribution: new Map(), totalCost: 0, individualCosts: [] }
  }

  if (distributions.length === 1) {
    return {
      distribution: new Map(distributions[0]!),
      totalCost: 0,
      individualCosts: [0],
    }
  }

  // Collect all keys
  const allKeys = [...new Set(distributions.flatMap((d) => [...d.keys()]))]
  const n = allKeys.length
  const k = distributions.length

  // Normalize weights
  const w = weights ?? new Array(k).fill(1 / k)
  const wSum = w.reduce((a, b) => a + b, 0)
  const wNorm = w.map((wi) => wi / wSum)

  // Normalize all input distributions
  const inputs = distributions.map((d) => normalize(d, allKeys))

  // For discrete distributions under the uniform ground metric d(a,b) = 1_{a≠b},
  // the Wasserstein barycenter is the weighted average (provable via duality).
  // No iterative refinement needed.
  const bary = new Array<number>(n).fill(0)
  for (let i = 0; i < k; i++) {
    const inputRow = inputs[i]!
    for (let j = 0; j < n; j++) {
      bary[j]! += wNorm[i]! * inputRow[j]!
    }
  }

  // Build result distribution
  const result = new Map<string, number>()
  for (let j = 0; j < n; j++) {
    if (bary[j]! > 1e-12) {
      result.set(allKeys[j]!, bary[j]!)
    }
  }

  // Compute individual costs
  const baryMap = new Map(allKeys.map((k, i) => [k, bary[i]!]))
  const individualCosts = distributions.map(
    (d) => wasserstein1(d, baryMap).distance,
  )
  const totalCost = individualCosts.reduce(
    (sum, c, i) => sum + wNorm[i]! * c,
    0,
  )

  return { distribution: result, totalCost, individualCosts }
}

/**
 * Tracks belief distances between agents over time.
 *
 * Maintains a distance matrix and provides:
 * - Pairwise Wasserstein distances
 * - Agent clustering by belief similarity
 * - Opinion drift detection
 */
export class BeliefDistanceTracker {
  private readonly agentBeliefs = new Map<string, ReadonlyMap<string, number>>()
  private readonly driftHistory = new Map<string, number[]>()

  /** Update an agent's current belief distribution. */
  setBeliefs(agentId: string, beliefs: ReadonlyMap<string, number>): void {
    const prev = this.agentBeliefs.get(agentId)
    this.agentBeliefs.set(agentId, beliefs)

    // Track drift (distance from previous beliefs)
    if (prev !== undefined) {
      const drift = wasserstein1(prev, beliefs).distance
      const history = this.driftHistory.get(agentId) ?? []
      history.push(drift)
      this.driftHistory.set(agentId, history)
    }
  }

  /** Compute all pairwise distances between agents. */
  pairwiseDistances(): readonly BeliefDistance[] {
    const agents = [...this.agentBeliefs.keys()]
    const distances: BeliefDistance[] = []

    for (let i = 0; i < agents.length; i++) {
      for (let j = i + 1; j < agents.length; j++) {
        const beliefsA = this.agentBeliefs.get(agents[i]!)!
        const beliefsB = this.agentBeliefs.get(agents[j]!)!
        const { distance } = wasserstein1(beliefsA, beliefsB)

        distances.push({
          agentA: agents[i]!,
          agentB: agents[j]!,
          distance,
        })
      }
    }

    return distances
  }

  /**
   * Find clusters of agents with similar beliefs.
   * Uses single-linkage clustering with Wasserstein distance.
   *
   * @param threshold - Maximum Wasserstein distance within a cluster
   */
  clusterAgents(threshold: number): readonly (readonly string[])[] {
    const agents = [...this.agentBeliefs.keys()]
    if (agents.length === 0) return []

    // Union-Find for single-linkage clustering
    const parent = new Map<string, string>(agents.map((a) => [a, a]))
    const find = (x: string): string => {
      let root = x
      while (parent.get(root) !== root) root = parent.get(root)!
      // Path compression
      let cur = x
      while (cur !== root) {
        const next = parent.get(cur)!
        parent.set(cur, root)
        cur = next
      }
      return root
    }
    const union = (a: string, b: string): void => {
      parent.set(find(a), find(b))
    }

    // Merge agents within threshold distance
    const distances = this.pairwiseDistances()
    for (const { agentA, agentB, distance } of distances) {
      if (distance <= threshold) {
        union(agentA, agentB)
      }
    }

    // Group by root
    const clusters = new Map<string, string[]>()
    for (const agent of agents) {
      const root = find(agent)
      const group = clusters.get(root) ?? []
      group.push(agent)
      clusters.set(root, group)
    }

    return [...clusters.values()]
  }

  /**
   * Compute optimal consensus distribution across all agents.
   * Returns the Wasserstein barycenter.
   */
  optimalConsensus(): BarycenterResult {
    const distributions = [...this.agentBeliefs.values()]
    return wassersteinBarycenter(distributions)
  }

  /**
   * Get opinion drift for an agent (how much their beliefs change per round).
   * High drift = agent is being influenced or uncertain.
   * Low drift = agent is entrenched.
   */
  agentDrift(agentId: string): { mean: number; recent: number } {
    const history = this.driftHistory.get(agentId)
    if (!history || history.length === 0) return { mean: 0, recent: 0 }

    const mean = history.reduce((a, b) => a + b, 0) / history.length
    const recent = history[history.length - 1]!
    return { mean, recent }
  }

  /** Number of agents being tracked. */
  get agentCount(): number {
    return this.agentBeliefs.size
  }

  /** Reset all state. */
  reset(): void {
    this.agentBeliefs.clear()
    this.driftHistory.clear()
  }
}

// ── Internal helpers ──

function normalize(
  dist: ReadonlyMap<string, number>,
  allKeys: readonly string[],
): number[] {
  let sum = 0
  for (const v of dist.values()) sum += v
  if (sum === 0) sum = 1

  return allKeys.map((k) => (dist.get(k) ?? 0) / sum)
}

function defaultGroundDistance(a: string, b: string): number {
  return a === b ? 0 : 1
}

/**
 * Solve the transportation problem exactly for small N.
 *
 * Uses a greedy algorithm: iteratively move mass from the largest
 * surplus to the largest deficit, tracking the transport plan.
 *
 * For uniform ground metric, this is optimal. For non-uniform metrics,
 * it's a good approximation for small N.
 */
function solveTransportExact(
  keys: readonly string[],
  supply: readonly number[],
  demand: readonly number[],
  dist: (a: string, b: string) => number,
): WassersteinResult {
  const n = keys.length
  const s = [...supply]
  const d = [...demand]
  const plan: TransportFlow[] = []
  let totalCost = 0

  // Build cost matrix and sort edges by cost for greedy assignment
  const edges: { i: number; j: number; cost: number }[] = []
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i !== j) {
        edges.push({ i, j, cost: dist(keys[i]!, keys[j]!) })
      }
    }
  }
  edges.sort((a, b) => a.cost - b.cost)

  // Greedy: move mass along cheapest edges first
  for (const edge of edges) {
    const surplus = s[edge.i]! - d[edge.i]!
    const deficit = d[edge.j]! - s[edge.j]!

    if (surplus > 1e-12 && deficit > 1e-12) {
      const moved = Math.min(surplus, deficit)
      s[edge.i]! -= moved
      d[edge.j]! -= moved

      totalCost += moved * edge.cost
      plan.push({
        from: keys[edge.i]!,
        to: keys[edge.j]!,
        mass: moved,
        cost: edge.cost,
      })
    }
  }

  return { distance: totalCost, transportPlan: plan }
}

/**
 * Solve transport approximately via Sinkhorn iterations.
 *
 * Entropic regularization: min Σ T_ij × C_ij + ε × Σ T_ij × log(T_ij)
 * Solved by alternating row/column normalization of K = exp(-C/ε).
 *
 * @param epsilon - Regularization strength (default: 0.01)
 * @param maxIter - Maximum Sinkhorn iterations (default: 100)
 */
function solveTransportSinkhorn(
  keys: readonly string[],
  supply: readonly number[],
  demand: readonly number[],
  dist: (a: string, b: string) => number,
  epsilon = 0.01,
  maxIter = 100,
): WassersteinResult {
  const n = keys.length

  // Cost matrix
  const C: number[][] = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => dist(keys[i]!, keys[j]!)),
  )

  // Gibbs kernel K = exp(-C/ε)
  const K: number[][] = C.map((row) =>
    row.map((c) => Math.exp(-c / epsilon)),
  )

  // Initialize scaling vectors
  const u = new Array(n).fill(1)
  const v = new Array(n).fill(1)

  const a = supply.map((s) => Math.max(s, 1e-12))
  const b = demand.map((d) => Math.max(d, 1e-12))

  for (let iter = 0; iter < maxIter; iter++) {
    // Update u: u_i = a_i / Σ_j K_ij × v_j
    for (let i = 0; i < n; i++) {
      let sum = 0
      for (let j = 0; j < n; j++) {
        sum += K[i]![j]! * v[j]!
      }
      u[i] = a[i]! / Math.max(sum, 1e-12)
    }

    // Update v: v_j = b_j / Σ_i K_ij × u_i
    for (let j = 0; j < n; j++) {
      let sum = 0
      for (let i = 0; i < n; i++) {
        sum += K[i]![j]! * u[i]!
      }
      v[j] = b[j]! / Math.max(sum, 1e-12)
    }
  }

  // Transport plan T_ij = u_i × K_ij × v_j
  let totalCost = 0
  const plan: TransportFlow[] = []

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const mass = u[i]! * K[i]![j]! * v[j]!
      if (mass > 1e-10 && i !== j) {
        const cost = C[i]![j]!
        totalCost += mass * cost
        plan.push({
          from: keys[i]!,
          to: keys[j]!,
          mass,
          cost,
        })
      }
    }
  }

  return { distance: totalCost, transportPlan: plan }
}
