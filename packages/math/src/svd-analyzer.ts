// SVD Analyzer — Singular Value Decomposition of Agent-Proposal interaction matrix.
//
// Decomposes the agent×proposal vote matrix A = UΣVᵀ to find:
//   - Latent dimensions: how many independent "axes of debate" exist
//   - Explained variance: σ₁²/Σσᵢ² = fraction of variance in first dimension
//   - Effective rank: number of significant singular values
//
// Key insight: if explained_variance(σ₁) > 0.8, the swarm is debating
// one thing along one axis — even if there are 5 proposals.

/** SVD analysis result. */
export interface SVDReport {
  /** Singular values (sorted descending). */
  readonly singularValues: readonly number[]
  /** Explained variance per dimension ∈ [0, 1]. */
  readonly explainedVariance: readonly number[]
  /** Cumulative explained variance. */
  readonly cumulativeVariance: readonly number[]
  /** Effective rank (number of dimensions explaining > 95% variance). */
  readonly effectiveRank: number
  /** Whether the debate is essentially 1-dimensional. */
  readonly oneDimensional: boolean
  /** Number of proposals. */
  readonly proposalCount: number
  /** Number of agents. */
  readonly agentCount: number
  /** Diagnostic message. */
  readonly diagnostic: string
}

/**
 * Performs SVD analysis on agent-proposal interactions.
 *
 * Usage:
 * ```ts
 * const svd = new SVDAnalyzer()
 *
 * // Record votes: agent, proposal, strength (positive = agree, negative = disagree)
 * svd.recordVote('a1', 'prop-A', 0.8)
 * svd.recordVote('a1', 'prop-B', -0.3)
 * svd.recordVote('a2', 'prop-A', -0.5)
 * svd.recordVote('a2', 'prop-B', 0.9)
 *
 * const report = svd.report()
 * // report.effectiveRank = 1 (a1 and a2 disagree along one axis)
 * // report.oneDimensional = true
 * ```
 */
export class SVDAnalyzer {
  private readonly votes = new Map<string, Map<string, number>>()
  private readonly agents = new Set<string>()
  private readonly proposals = new Set<string>()

  /** Record a vote/interaction. Strength: positive = support, negative = oppose. */
  recordVote(agentId: string, proposalId: string, strength: number): void {
    this.agents.add(agentId)
    this.proposals.add(proposalId)

    if (!this.votes.has(agentId)) {
      this.votes.set(agentId, new Map())
    }
    // Accumulate: multiple votes on same proposal get summed
    const agentVotes = this.votes.get(agentId)!
    agentVotes.set(proposalId, (agentVotes.get(proposalId) ?? 0) + strength)
  }

  /** Generate SVD analysis report. */
  report(): SVDReport {
    const agentList = [...this.agents]
    const proposalList = [...this.proposals]
    const m = agentList.length
    const n = proposalList.length

    if (m < 2 || n < 2) {
      return {
        singularValues: [],
        explainedVariance: [],
        cumulativeVariance: [],
        effectiveRank: Math.min(m, n),
        oneDimensional: m <= 1 || n <= 1,
        proposalCount: n,
        agentCount: m,
        diagnostic: 'Need at least 2 agents and 2 proposals for SVD analysis.',
      }
    }

    // Build matrix A (m × n)
    const A: number[][] = []
    for (let i = 0; i < m; i++) {
      const row: number[] = []
      const agentVotes = this.votes.get(agentList[i]!) ?? new Map()
      for (let j = 0; j < n; j++) {
        row.push(agentVotes.get(proposalList[j]!) ?? 0)
      }
      A.push(row)
    }

    // Compute AᵀA (n × n) — eigenvalues = σᵢ²
    const AtA = this.matMul(this.transpose(A), A)

    // Power iteration for top singular values
    const k = Math.min(m, n, 6) // at most 6 singular values
    const singularValues = this.computeSingularValues(AtA, n, k)

    // Explained variance
    const totalVariance = singularValues.reduce((s, v) => s + v * v, 0)
    const explainedVariance = totalVariance > 0
      ? singularValues.map(v => (v * v) / totalVariance)
      : singularValues.map(() => 0)

    const cumulativeVariance: number[] = []
    let cumSum = 0
    for (const ev of explainedVariance) {
      cumSum += ev
      cumulativeVariance.push(Math.min(1, cumSum))
    }

    // Effective rank: dimensions needed for 95% variance
    let effectiveRank = singularValues.length
    for (let i = 0; i < cumulativeVariance.length; i++) {
      if (cumulativeVariance[i]! >= 0.95) {
        effectiveRank = i + 1
        break
      }
    }

    const oneDimensional = effectiveRank === 1 || (explainedVariance[0] ?? 0) > 0.8
    const diagnostic = this.buildDiagnostic(effectiveRank, n, explainedVariance, oneDimensional)

    return {
      singularValues,
      explainedVariance,
      cumulativeVariance,
      effectiveRank,
      oneDimensional,
      proposalCount: n,
      agentCount: m,
      diagnostic,
    }
  }

  get agentCount(): number {
    return this.agents.size
  }

  get proposalCount(): number {
    return this.proposals.size
  }

  reset(): void {
    this.votes.clear()
    this.agents.clear()
    this.proposals.clear()
  }

  // ── Matrix operations ─────────────────────────────────────────

  private transpose(A: number[][]): number[][] {
    const m = A.length
    const n = A[0]?.length ?? 0
    const T: number[][] = Array.from({ length: n }, () => new Array<number>(m).fill(0))
    for (let i = 0; i < m; i++) {
      for (let j = 0; j < n; j++) {
        T[j]![i] = A[i]![j]!
      }
    }
    return T
  }

  private matMul(A: number[][], B: number[][]): number[][] {
    const m = A.length
    const n = B[0]?.length ?? 0
    const k = B.length
    const C: number[][] = Array.from({ length: m }, () => new Array<number>(n).fill(0))
    for (let i = 0; i < m; i++) {
      for (let j = 0; j < n; j++) {
        let sum = 0
        for (let p = 0; p < k; p++) {
          sum += A[i]![p]! * B[p]![j]!
        }
        C[i]![j] = sum
      }
    }
    return C
  }

  /**
   * Compute top-k singular values via power iteration on AᵀA.
   * Uses deflation: after finding each eigenvalue, subtract its component.
   */
  private computeSingularValues(AtA: number[][], n: number, k: number): number[] {
    const values: number[] = []
    const matrix = AtA.map(row => [...row]) // clone

    for (let dim = 0; dim < k; dim++) {
      const eigenvalue = this.powerIteration(matrix, n)
      if (eigenvalue < 1e-10) break

      values.push(Math.sqrt(eigenvalue))

      // Deflation: A' = A - λvvᵀ
      const eigenvector = this.getEigenvector(matrix, n)
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          matrix[i]![j]! -= eigenvalue * eigenvector[i]! * eigenvector[j]!
        }
      }
    }

    return values
  }

  /** Power iteration to find dominant eigenvalue. */
  private powerIteration(M: number[][], n: number, maxIter = 100): number {
    let v = new Array<number>(n).fill(1 / Math.sqrt(n))
    let eigenvalue = 0

    for (let iter = 0; iter < maxIter; iter++) {
      // w = M·v
      const w = new Array<number>(n).fill(0)
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          w[i]! += M[i]![j]! * v[j]!
        }
      }

      // Eigenvalue estimate = ||w||
      let norm = 0
      for (let i = 0; i < n; i++) norm += w[i]! * w[i]!
      norm = Math.sqrt(norm)

      if (norm < 1e-15) return 0

      const newEigenvalue = norm
      // Normalize
      for (let i = 0; i < n; i++) v[i] = w[i]! / norm

      if (Math.abs(newEigenvalue - eigenvalue) < 1e-10) {
        eigenvalue = newEigenvalue
        break
      }
      eigenvalue = newEigenvalue
    }

    // Rayleigh quotient for better estimate
    const Mv = new Array<number>(n).fill(0)
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        Mv[i]! += M[i]![j]! * v[j]!
      }
    }
    let rayleigh = 0
    for (let i = 0; i < n; i++) rayleigh += v[i]! * Mv[i]!

    return Math.max(0, rayleigh)
  }

  /** Get dominant eigenvector via power iteration. */
  private getEigenvector(M: number[][], n: number): number[] {
    let v = new Array<number>(n).fill(1 / Math.sqrt(n))

    // Simple power iteration (M is already near-rank-1 for dominant eigenvalue)
    for (let iter = 0; iter < 50; iter++) {
      const w = new Array<number>(n).fill(0)
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          w[i]! += M[i]![j]! * v[j]!
        }
      }
      let norm = 0
      for (let i = 0; i < n; i++) norm += w[i]! * w[i]!
      norm = Math.sqrt(norm)
      if (norm < 1e-15) break
      v = w.map(x => x / norm)
    }

    return v
  }

  private buildDiagnostic(
    effectiveRank: number,
    proposalCount: number,
    explained: readonly number[],
    oneDimensional: boolean,
  ): string {
    if (oneDimensional) {
      return `Debate is essentially 1-dimensional `
        + `(${((explained[0] ?? 0) * 100).toFixed(0)}% variance in first component). `
        + `Despite ${proposalCount} proposals, agents disagree along a single axis.`
    }
    if (effectiveRank < proposalCount) {
      return `Effective rank ${effectiveRank} < ${proposalCount} proposals: `
        + `some proposals are linearly dependent in agent preferences.`
    }
    return `Full-rank debate: ${effectiveRank} independent dimensions of disagreement.`
  }
}
