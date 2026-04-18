// Influence graph - spectral analysis of agent influence.
// Eigenvector centrality (PageRank-like) + algebraic connectivity (Fiedler value).

/** A directed influence edge between agents. */
export interface InfluenceEdge {
  readonly from: string
  readonly to: string
  readonly weight: number
}

/** Full influence analysis report. */
export interface InfluenceReport {
  /** Eigenvector centrality per agent. Higher = more influential. */
  readonly centrality: ReadonlyMap<string, number>
  /** Algebraic connectivity (Fiedler value). 0 = disconnected. */
  readonly fiedlerValue: number
  /** Agent with highest centrality. */
  readonly dominantInfluencer: string | undefined
  /** Agents with near-zero centrality (< 0.1 * max). */
  readonly isolatedAgents: readonly string[]
  /** Gini coefficient of centrality distribution ∈ [0, 1]. */
  readonly influenceConcentration: number
  /** True if removing the dominant influencer disconnects the graph. */
  readonly isFragile: boolean
}

/** Default number of power iterations. */
const DEFAULT_ITERATIONS = 50
/** Convergence threshold for power iteration. */
const POWER_ITERATION_DELTA = 1e-8

/**
 * Directed weighted influence graph with spectral analysis.
 *
 * Usage:
 * ```ts
 * const graph = new InfluenceGraph()
 *
 * graph.addEdge({ from: 'agent-1', to: 'agent-2', weight: 1.0 })
 * graph.addEdge({ from: 'agent-1', to: 'agent-3', weight: 0.5 })
 * graph.addEdge({ from: 'agent-2', to: 'agent-3', weight: 0.8 })
 *
 * const report = graph.analyze()
 * // report.dominantInfluencer === 'agent-1'
 * // report.isolatedAgents === [] (all connected)
 * // report.influenceConcentration - how evenly distributed
 * ```
 */
export class InfluenceGraph {
  private readonly edges: InfluenceEdge[] = []
  private readonly agents = new Set<string>()

  /** Record an influence edge. */
  addEdge(edge: InfluenceEdge): void {
    this.edges.push(edge)
    this.agents.add(edge.from)
    this.agents.add(edge.to)
  }

  /**
   * Compute eigenvector centrality via power iteration.
   *
   * The dominant eigenvector of the adjacency matrix gives
   * each agent a centrality score. Agents pointed to by
   * high-centrality agents get higher scores themselves.
   */
  computeCentrality(iterations = DEFAULT_ITERATIONS): ReadonlyMap<string, number> {
    const agentList = [...this.agents]
    const n = agentList.length
    if (n === 0) return new Map()

    const idx = new Map<string, number>()
    for (let i = 0; i < n; i++) {
      idx.set(agentList[i]!, i)
    }

    // Build adjacency matrix
    const adj: number[][] = Array.from({ length: n }, () =>
      new Array<number>(n).fill(0),
    )

    for (const edge of this.edges) {
      const i = idx.get(edge.from)
      const j = idx.get(edge.to)
      if (i !== undefined && j !== undefined) {
        adj[i]![j]! += Math.abs(edge.weight)
      }
    }

    // Power iteration on A^T (incoming influence)
    let vec = new Array<number>(n).fill(1 / n)

    for (let iter = 0; iter < iterations; iter++) {
      const next = new Array<number>(n).fill(0)

      // Multiply: next = A^T × vec (incoming links)
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          next[i]! += adj[j]![i]! * vec[j]!
        }
      }

      // Normalize
      let norm = 0
      for (let i = 0; i < n; i++) norm += next[i]! * next[i]!
      norm = Math.sqrt(norm)

      if (norm > 0) {
        for (let i = 0; i < n; i++) next[i]! /= norm
      }

      // Check convergence
      let delta = 0
      for (let i = 0; i < n; i++) {
        delta += Math.abs(next[i]! - vec[i]!)
      }

      vec = next
      if (delta < POWER_ITERATION_DELTA) break
    }

    // Convert to map, normalize to [0, 1]
    let maxVal = 0
    for (const v of vec) maxVal = Math.max(maxVal, v)

    const result = new Map<string, number>()
    for (let i = 0; i < n; i++) {
      result.set(agentList[i]!, maxVal > 0 ? vec[i]! / maxVal : 0)
    }

    return result
  }

  /**
   * Algebraic connectivity (Fiedler value).
   *
   * Second-smallest eigenvalue of the graph Laplacian.
   * Computed on the undirected projection (symmetrize adjacency).
   *
   * lambda2 = 0 -> graph is disconnected or has isolated components
   * lambda2 > 0 -> graph is connected, higher = more robust
   */
  algebraicConnectivity(): number {
    const agentList = [...this.agents]
    const n = agentList.length
    if (n < 2) return 0

    // Fast check: if graph is disconnected, λ₂ = 0
    if (!this.isConnected()) return 0

    const idx = new Map<string, number>()
    for (let i = 0; i < n; i++) {
      idx.set(agentList[i]!, i)
    }

    // Build symmetric adjacency (undirected projection)
    const adj: number[][] = Array.from({ length: n }, () =>
      new Array<number>(n).fill(0),
    )

    for (const edge of this.edges) {
      const i = idx.get(edge.from)
      const j = idx.get(edge.to)
      if (i !== undefined && j !== undefined && i !== j) {
        const w = Math.abs(edge.weight)
        adj[i]![j]! += w
        adj[j]![i]! += w
      }
    }

    // Laplacian L = D - A
    const laplacian: number[][] = Array.from({ length: n }, () =>
      new Array<number>(n).fill(0),
    )

    for (let i = 0; i < n; i++) {
      let degree = 0
      for (let j = 0; j < n; j++) {
        degree += adj[i]![j]!
        laplacian[i]![j] = -adj[i]![j]!
      }
      laplacian[i]![i] = degree
    }

    // Find second-smallest eigenvalue via inverse power iteration
    // with deflation of the constant eigenvector [1,1,...,1]/√n
    return fiedlerValue(laplacian, n)
  }

  /** Full influence analysis. */
  analyze(): InfluenceReport {
    const centrality = this.computeCentrality()
    const fiedler = this.algebraicConnectivity()

    let dominantInfluencer: string | undefined
    let maxCentrality = 0

    for (const [agent, c] of centrality) {
      if (c > maxCentrality) {
        maxCentrality = c
        dominantInfluencer = agent
      }
    }

    // Isolated: centrality < 10% of max
    const isolationThreshold = maxCentrality * 0.1
    const isolatedAgents: string[] = []
    for (const [agent, c] of centrality) {
      if (c < isolationThreshold && c < 0.05) {
        isolatedAgents.push(agent)
      }
    }

    const concentration = giniCoefficient([...centrality.values()])

    // Fragility: check if removing dominant changes connectivity
    const isFragile =
      dominantInfluencer !== undefined &&
      this.checkFragility(dominantInfluencer)

    return {
      centrality,
      fiedlerValue: fiedler,
      dominantInfluencer,
      isolatedAgents,
      influenceConcentration: concentration,
      isFragile,
    }
  }

  /**
   * Check if removing an agent would fragment the graph.
   * Uses BFS on the undirected projection.
   */
  robustnessCheck(
    agentId: string,
  ): { connected: boolean; components: number } {
    const remaining = [...this.agents].filter((a) => a !== agentId)
    if (remaining.length === 0) return { connected: true, components: 0 }

    // Build adjacency for remaining agents
    const adj = new Map<string, Set<string>>()
    for (const a of remaining) adj.set(a, new Set())

    for (const edge of this.edges) {
      if (edge.from === agentId || edge.to === agentId) continue
      if (!adj.has(edge.from) || !adj.has(edge.to)) continue
      adj.get(edge.from)!.add(edge.to)
      adj.get(edge.to)!.add(edge.from)
    }

    // BFS to count components
    const visited = new Set<string>()
    let components = 0

    for (const agent of remaining) {
      if (visited.has(agent)) continue
      components++

      const queue = [agent]
      visited.add(agent)
      while (queue.length > 0) {
        const current = queue.pop()!
        for (const neighbor of adj.get(current) ?? []) {
          if (!visited.has(neighbor)) {
            visited.add(neighbor)
            queue.push(neighbor)
          }
        }
      }
    }

    return { connected: components <= 1, components }
  }

  /** Number of edges in the graph. */
  get edgeCount(): number {
    return this.edges.length
  }

  /** Number of agents in the graph. */
  get nodeCount(): number {
    return this.agents.size
  }

  /** Reset all state. */
  reset(): void {
    this.edges.length = 0
    this.agents.clear()
  }

  private checkFragility(agentId: string): boolean {
    if (this.agents.size <= 2) return false
    const { connected } = this.robustnessCheck(agentId)
    return !connected
  }

  /** BFS connectivity check on undirected projection. */
  private isConnected(): boolean {
    const agentList = [...this.agents]
    if (agentList.length <= 1) return true

    const adj = new Map<string, Set<string>>()
    for (const a of agentList) adj.set(a, new Set())

    for (const edge of this.edges) {
      if (edge.from !== edge.to) {
        adj.get(edge.from)?.add(edge.to)
        adj.get(edge.to)?.add(edge.from)
      }
    }

    const visited = new Set<string>()
    const queue = [agentList[0]!]
    visited.add(agentList[0]!)

    while (queue.length > 0) {
      const current = queue.pop()!
      for (const neighbor of adj.get(current) ?? []) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor)
          queue.push(neighbor)
        }
      }
    }

    return visited.size === agentList.length
  }
}

/**
 * Approximate Fiedler value (second-smallest eigenvalue of Laplacian).
 *
 * Uses shifted inverse power iteration with deflation of the
 * trivial eigenvector [1,...,1]/√n.
 *
 * For small matrices (n < 20), this converges quickly.
 */
function fiedlerValue(L: number[][], n: number): number {
  if (n < 2) return 0

  // The smallest eigenvalue of L is always 0 with eigenvector [1,...,1]/√n.
  // We want λ₂, so we use power iteration on (μI - L) and deflate.

  // Estimate μ (upper bound on max eigenvalue): Gershgorin
  let mu = 0
  for (let i = 0; i < n; i++) {
    let rowSum = 0
    for (let j = 0; j < n; j++) rowSum += Math.abs(L[i]![j]!)
    mu = Math.max(mu, rowSum)
  }
  mu += 1

  // M = μI - L (flips eigenvalues: largest of M = μ - λ_smallest of L)
  const M: number[][] = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) =>
      (i === j ? mu : 0) - L[i]![j]!,
    ),
  )

  // Deflated power iteration:
  // After each multiply, remove component along [1,...,1]/√n
  const ones = new Array<number>(n).fill(1 / Math.sqrt(n))

  let vec = new Array<number>(n).fill(0)
  // Initialize with something not parallel to ones
  for (let i = 0; i < n; i++) vec[i] = (i % 2 === 0 ? 1 : -1)
  deflate(vec, ones)
  normalize(vec)

  for (let iter = 0; iter < 100; iter++) {
    const next = new Array<number>(n).fill(0)
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        next[i]! += M[i]![j]! * vec[j]!
      }
    }

    // Remove component along trivial eigenvector
    deflate(next, ones)
    normalize(next)

    // Check convergence
    let delta = 0
    for (let i = 0; i < n; i++) delta += Math.abs(next[i]! - vec[i]!)
    vec = next
    if (delta < 1e-10) break
  }

  // Compute Rayleigh quotient: λ₂ = v^T L v / v^T v
  let numerator = 0
  for (let i = 0; i < n; i++) {
    let lv_i = 0
    for (let j = 0; j < n; j++) lv_i += L[i]![j]! * vec[j]!
    numerator += vec[i]! * lv_i
  }

  let denominator = 0
  for (let i = 0; i < n; i++) denominator += vec[i]! * vec[i]!

  return denominator > 0 ? Math.max(0, numerator / denominator) : 0
}

function deflate(vec: number[], basis: number[]): void {
  let dot = 0
  for (let i = 0; i < vec.length; i++) dot += vec[i]! * basis[i]!
  for (let i = 0; i < vec.length; i++) vec[i]! -= dot * basis[i]!
}

function normalize(vec: number[]): void {
  let norm = 0
  for (const v of vec) norm += v * v
  norm = Math.sqrt(norm)
  if (norm > 0) {
    for (let i = 0; i < vec.length; i++) vec[i]! /= norm
  }
}

/**
 * Gini coefficient of a distribution.
 * 0 = perfectly equal, 1 = maximum inequality.
 */
function giniCoefficient(values: number[]): number {
  const n = values.length
  if (n < 2) return 0

  const sorted = [...values].sort((a, b) => a - b)
  const mean = sorted.reduce((s, v) => s + v, 0) / n

  if (mean === 0) return 0

  let sumDiff = 0
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      sumDiff += Math.abs(sorted[i]! - sorted[j]!)
    }
  }

  return sumDiff / (2 * n * n * mean)
}
