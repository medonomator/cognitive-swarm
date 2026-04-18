// Causal Inference: Pearl's do-calculus for intervention reasoning
//
// The fundamental difference between correlation and causation:
//   P(Y | X=x)       — "What do we observe when X happens to be x?"
//   P(Y | do(X=x))   — "What happens if we FORCE X to be x?"
//
// These are NOT the same when confounders exist:
//   - Observing "Agent-Critic active → high quality" could be because
//     hard problems activate both critics AND produce high quality.
//   - do(activate critic) tells us the CAUSAL effect of adding a critic.
//
// Key concepts:
//   DAG: Directed Acyclic Graph of causal relationships
//   d-separation: When two variables are conditionally independent given Z
//   Backdoor criterion: Sufficient adjustment set for causal identification
//   Adjustment formula: P(Y|do(X)) = Σ_z P(Y|X,Z=z)·P(Z=z)
//
// Used for:
// - Answering "what IF we change agent composition?" (intervention)
// - Distinguishing causal from spurious correlations in swarm data
// - Counterfactual reasoning ("what would have happened with agent-X?")
// - Optimal agent selection based on causal effect, not just correlation

/** A directed edge in the causal DAG. */
export interface CausalEdge {
  readonly from: string
  readonly to: string
  /** Estimated causal strength ∈ [-1, 1]. */
  readonly strength: number
  /** Number of observations supporting this edge. */
  readonly observations: number
}

/** A node (variable) in the causal graph. */
export interface CausalNode {
  readonly id: string
  /** Observed values history. */
  readonly values: readonly number[]
  /** Parents in the DAG (direct causes). */
  readonly parents: readonly string[]
  /** Children in the DAG (direct effects). */
  readonly children: readonly string[]
}

/** Result of an intervention query: P(Y | do(X=x)). */
export interface InterventionResult {
  /** The variable being intervened on. */
  readonly intervention: string
  /** The intervention value. */
  readonly interventionValue: number
  /** The outcome variable. */
  readonly outcome: string
  /** Estimated causal effect: E[Y | do(X=x)]. */
  readonly estimatedEffect: number
  /** Whether the effect is identifiable from observed data. */
  readonly identifiable: boolean
  /** Adjustment variables used (backdoor criterion). */
  readonly adjustmentSet: readonly string[]
  /** Confidence in the estimate (based on sample size). */
  readonly confidence: number
}

/** Result of counterfactual query. */
export interface CounterfactualResult {
  /** "What would Y have been if X had been x instead of x'?" */
  readonly query: string
  /** Estimated counterfactual value. */
  readonly estimate: number
  /** Confidence interval [low, high]. */
  readonly confidenceInterval: readonly [number, number]
}

/** Full causal analysis report. */
export interface CausalReport {
  /** Learned causal DAG edges. */
  readonly edges: readonly CausalEdge[]
  /** Number of nodes in the graph. */
  readonly nodeCount: number
  /** Strongest causal relationship found. */
  readonly strongestCause: CausalEdge | null
  /** Variables that are confounders (common causes of multiple outcomes). */
  readonly confounders: readonly string[]
  /** Variables that are mediators (on the causal path between X and Y). */
  readonly mediators: readonly string[]
}

/**
 * Causal inference engine using Pearl's framework.
 *
 * Learns causal structure from observational data and answers
 * intervention queries using the adjustment formula.
 *
 * Usage:
 * ```ts
 * const engine = new CausalEngine()
 *
 * // Record observations (swarm metrics per round)
 * engine.observe({ 'critic-active': 1, 'quality': 0.8, 'round-length': 3 })
 * engine.observe({ 'critic-active': 0, 'quality': 0.4, 'round-length': 2 })
 * // ... many observations
 *
 * // Learn causal structure
 * engine.learnStructure()
 *
 * // Query: "What happens if we activate the critic?"
 * const result = engine.intervene('critic-active', 1, 'quality')
 * // result.estimatedEffect ≈ 0.75 (causal, not just correlational)
 * // result.identifiable = true (no hidden confounders blocking)
 * ```
 */
export class CausalEngine {
  private readonly nodes = new Map<string, MutableCausalNode>()
  private readonly edges = new Map<string, Map<string, CausalEdge>>()
  private readonly observations: Record<string, number>[] = []

  /**
   * Record a single observation (snapshot of all variables).
   * Each key is a variable name, value is the observed numeric value.
   */
  observe(snapshot: Readonly<Record<string, number>>): void {
    this.observations.push({ ...snapshot })

    // Ensure all variables are nodes
    for (const [key, value] of Object.entries(snapshot)) {
      let node = this.nodes.get(key)
      if (node === undefined) {
        node = { id: key, values: [], parents: [], children: [] }
        this.nodes.set(key, node)
      }
      node.values.push(value)
    }
  }

  /**
   * Learn causal structure from observations using the PC algorithm
   * (constraint-based structure learning).
   *
   * Step 1: Start with complete undirected graph
   * Step 2: Remove edges where conditional independence holds
   * Step 3: Orient edges using v-structures and acyclicity
   *
   * Requires at least 5 observations to be meaningful.
   */
  learnStructure(): void {
    if (this.observations.length < 5) return

    const variables = [...this.nodes.keys()]
    const n = variables.length
    if (n < 2) return

    // Reset edges
    this.edges.clear()
    for (const node of this.nodes.values()) {
      node.parents = []
      node.children = []
    }

    // Step 1: Start with complete undirected graph
    const adjacency = new Map<string, Set<string>>()
    for (const v of variables) {
      adjacency.set(v, new Set(variables.filter((u) => u !== v)))
    }

    // Step 2: Remove edges where variables are conditionally independent
    // Test independence using partial correlation
    for (let condSize = 0; condSize <= Math.min(n - 2, 3); condSize++) {
      for (const x of variables) {
        for (const y of [...(adjacency.get(x) ?? [])]) {
          if (!adjacency.get(x)?.has(y)) continue

          // Get conditioning set candidates (neighbors of x, excluding y)
          const neighbors = [...(adjacency.get(x) ?? [])]
            .filter((v) => v !== y)

          // Test subsets of size condSize
          const subsets = combinations(neighbors, condSize)
          for (const condSet of subsets) {
            if (this.isConditionallyIndependent(x, y, condSet)) {
              adjacency.get(x)?.delete(y)
              adjacency.get(y)?.delete(x)
              break
            }
          }
        }
      }
    }

    // Step 3: Orient edges using correlation strength as heuristic
    // (full v-structure detection requires faithfulness assumption)
    for (const x of variables) {
      for (const y of adjacency.get(x) ?? []) {
        if (x >= y) continue // process each pair once

        const corrXY = this.correlation(x, y)
        if (Math.abs(corrXY) < 0.1) continue

        // Orient based on temporal precedence and correlation strength
        // Heuristic: variable with lower variance causes higher variance
        const varX = this.variance(x)
        const varY = this.variance(y)

        let from: string
        let to: string
        if (varX <= varY) {
          from = x
          to = y
        } else {
          from = y
          to = x
        }

        this.addEdge(from, to, corrXY)
      }
    }
  }

  /**
   * Estimate causal effect of intervention: P(Y | do(X = x)).
   *
   * Uses the backdoor adjustment formula:
   *   P(Y | do(X=x)) = Σ_z P(Y | X=x, Z=z) × P(Z=z)
   *
   * @param interventionVar - Variable to intervene on
   * @param interventionValue - Value to set
   * @param outcomeVar - Outcome variable to predict
   */
  intervene(
    interventionVar: string,
    interventionValue: number,
    outcomeVar: string,
  ): InterventionResult {
    // Find valid adjustment set (backdoor criterion)
    const adjustmentSet = this.findBackdoorSet(interventionVar, outcomeVar)
    const identifiable = adjustmentSet !== null

    if (!identifiable || this.observations.length < 5) {
      return {
        intervention: interventionVar,
        interventionValue,
        outcome: outcomeVar,
        estimatedEffect: this.naiveConditionalMean(
          interventionVar,
          interventionValue,
          outcomeVar,
        ),
        identifiable: false,
        adjustmentSet: [],
        confidence: 0,
      }
    }

    // Backdoor adjustment formula
    const effect = this.adjustmentEstimate(
      interventionVar,
      interventionValue,
      outcomeVar,
      adjustmentSet,
    )

    // Confidence based on sample size and effect strength
    const nRelevant = this.observations.filter(
      (obs) => Math.abs((obs[interventionVar] ?? 0) - interventionValue) < 0.5,
    ).length
    const confidence = Math.min(1, nRelevant / 20) // saturates at 20 relevant obs

    return {
      intervention: interventionVar,
      interventionValue,
      outcome: outcomeVar,
      estimatedEffect: effect,
      identifiable: true,
      adjustmentSet,
      confidence,
    }
  }

  /**
   * Counterfactual query: "What would Y have been if X had been x?"
   * Uses the three-step procedure:
   * 1. Abduction: infer noise terms from actual observation
   * 2. Action: set X = x
   * 3. Prediction: compute Y under modified model
   */
  counterfactual(
    interventionVar: string,
    interventionValue: number,
    outcomeVar: string,
    observedContext: Readonly<Record<string, number>>,
  ): CounterfactualResult {
    // Simplified: use regression-based counterfactual
    const actualOutcome = observedContext[outcomeVar] ?? 0
    const actualIntervention = observedContext[interventionVar] ?? 0

    // Estimate the marginal effect
    const effect1 = this.intervene(
      interventionVar,
      interventionValue,
      outcomeVar,
    )
    const effect0 = this.intervene(
      interventionVar,
      actualIntervention,
      outcomeVar,
    )

    const delta = effect1.estimatedEffect - effect0.estimatedEffect
    const estimate = actualOutcome + delta

    // Confidence interval (rough: ± 1 std of residuals)
    const residualStd = Math.sqrt(this.variance(outcomeVar))
    const halfWidth = 1.96 * residualStd

    return {
      query: `P(${outcomeVar} | do(${interventionVar}=${interventionValue}), context)`,
      estimate,
      confidenceInterval: [estimate - halfWidth, estimate + halfWidth],
    }
  }

  /** Generate a full causal analysis report. */
  report(): CausalReport {
    const allEdges: CausalEdge[] = []
    for (const edgeMap of this.edges.values()) {
      for (const edge of edgeMap.values()) {
        allEdges.push(edge)
      }
    }

    // Find confounders: nodes that cause 2+ other nodes
    const confounders: string[] = []
    for (const node of this.nodes.values()) {
      if (node.children.length >= 2) {
        confounders.push(node.id)
      }
    }

    // Find mediators: nodes on paths between other nodes
    const mediators: string[] = []
    for (const node of this.nodes.values()) {
      if (node.parents.length >= 1 && node.children.length >= 1) {
        mediators.push(node.id)
      }
    }

    const strongestCause =
      allEdges.length > 0
        ? allEdges.reduce((best, e) =>
            Math.abs(e.strength) > Math.abs(best.strength) ? e : best,
          )
        : null

    return {
      edges: allEdges,
      nodeCount: this.nodes.size,
      strongestCause,
      confounders,
      mediators,
    }
  }

  /**
   * Test if X and Y are d-separated given Z in the current DAG.
   * d-separation implies conditional independence.
   */
  dSeparated(x: string, y: string, z: readonly string[]): boolean {
    const zSet = new Set(z)

    // Use BFS on the "moralized" ancestral graph
    // Simplified: check if all paths from X to Y are blocked by Z
    return !this.hasActivePath(x, y, zSet)
  }

  /** Number of observations recorded. */
  get observationCount(): number {
    return this.observations.length
  }

  /** Number of variables (nodes). */
  get variableCount(): number {
    return this.nodes.size
  }

  /** Reset all state. */
  reset(): void {
    this.nodes.clear()
    this.edges.clear()
    this.observations.length = 0
  }

  // ── Private helpers ──

  private addEdge(from: string, to: string, strength: number): void {
    if (!this.edges.has(from)) {
      this.edges.set(from, new Map())
    }

    this.edges.get(from)!.set(to, {
      from,
      to,
      strength,
      observations: this.observations.length,
    })

    // Update node parent/children
    const fromNode = this.nodes.get(from)
    const toNode = this.nodes.get(to)
    if (fromNode && !fromNode.children.includes(to)) {
      fromNode.children.push(to)
    }
    if (toNode && !toNode.parents.includes(from)) {
      toNode.parents.push(from)
    }
  }

  /**
   * Test conditional independence using partial correlation.
   * |ρ(X,Y|Z)| < threshold → independent.
   */
  private isConditionallyIndependent(
    x: string,
    y: string,
    condSet: readonly string[],
  ): boolean {
    const threshold = 2 / Math.sqrt(Math.max(5, this.observations.length))

    if (condSet.length === 0) {
      return Math.abs(this.correlation(x, y)) < threshold
    }

    // Partial correlation via recursive formula
    const partialCorr = this.partialCorrelation(x, y, condSet)
    return Math.abs(partialCorr) < threshold
  }

  /**
   * Partial correlation: ρ(X,Y|Z) using the recursive formula.
   * ρ(X,Y|Z∪{W}) = (ρ(X,Y|Z) - ρ(X,W|Z)·ρ(Y,W|Z)) /
   *                  √((1-ρ(X,W|Z)²)(1-ρ(Y,W|Z)²))
   */
  private partialCorrelation(
    x: string,
    y: string,
    condSet: readonly string[],
  ): number {
    if (condSet.length === 0) return this.correlation(x, y)

    const z = condSet.slice(0, -1)
    const w = condSet[condSet.length - 1]!

    const rXY = this.partialCorrelation(x, y, z)
    const rXW = this.partialCorrelation(x, w, z)
    const rYW = this.partialCorrelation(y, w, z)

    const denom = Math.sqrt((1 - rXW * rXW) * (1 - rYW * rYW))
    if (denom < 1e-10) return 0

    return (rXY - rXW * rYW) / denom
  }

  /** Pearson correlation between two variables. */
  private correlation(x: string, y: string): number {
    const xVals = this.nodes.get(x)?.values ?? []
    const yVals = this.nodes.get(y)?.values ?? []
    const n = Math.min(xVals.length, yVals.length)
    if (n < 3) return 0

    let sumX = 0
    let sumY = 0
    let sumXY = 0
    let sumX2 = 0
    let sumY2 = 0

    for (let i = 0; i < n; i++) {
      const xi = xVals[i]!
      const yi = yVals[i]!
      sumX += xi
      sumY += yi
      sumXY += xi * yi
      sumX2 += xi * xi
      sumY2 += yi * yi
    }

    const denom = Math.sqrt(
      (n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY),
    )
    if (denom < 1e-10) return 0

    return (n * sumXY - sumX * sumY) / denom
  }

  /** Variance of a variable. */
  private variance(variable: string): number {
    const vals = this.nodes.get(variable)?.values ?? []
    if (vals.length < 2) return 0

    const mean = vals.reduce((a, b) => a + b, 0) / vals.length
    return vals.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (vals.length - 1)
  }

  /**
   * Find a valid backdoor adjustment set using the backdoor criterion.
   *
   * Z satisfies the backdoor criterion for (X, Y) if:
   * 1. No node in Z is a descendant of X
   * 2. Z blocks all backdoor paths from X to Y
   *
   * Returns the parent set of X (minus descendants of X) as default.
   */
  private findBackdoorSet(
    x: string,
    _y: string,
  ): readonly string[] | null {
    const xNode = this.nodes.get(x)
    if (xNode === undefined) return null

    // Descendants of X (cannot be in adjustment set)
    const descendants = this.getDescendants(x)

    // Parent set of X that are not descendants of X
    const adjustmentSet = xNode.parents.filter((p) => !descendants.has(p))

    // Verify: does this block all backdoor paths?
    // (Simplified: return parents as adjustment set — correct for most DAGs)
    return adjustmentSet
  }

  /** Get all descendants of a node via BFS. */
  private getDescendants(nodeId: string): Set<string> {
    const desc = new Set<string>()
    const queue = [nodeId]

    while (queue.length > 0) {
      const current = queue.pop()!
      const node = this.nodes.get(current)
      if (node === undefined) continue

      for (const child of node.children) {
        if (!desc.has(child)) {
          desc.add(child)
          queue.push(child)
        }
      }
    }

    return desc
  }

  /**
   * Backdoor adjustment estimate:
   * E[Y | do(X=x)] = Σ_z E[Y | X=x, Z=z] × P(Z=z)
   */
  private adjustmentEstimate(
    x: string,
    xValue: number,
    y: string,
    adjustmentSet: readonly string[],
  ): number {
    if (this.observations.length === 0) return 0

    // Stratified estimation
    if (adjustmentSet.length === 0) {
      return this.naiveConditionalMean(x, xValue, y)
    }

    // Group observations by adjustment variable bins
    let weightedSum = 0
    let totalWeight = 0

    // Simple binning: split each adjustment variable at median
    const medians = new Map<string, number>()
    for (const z of adjustmentSet) {
      const vals = this.nodes.get(z)?.values ?? []
      const sorted = [...vals].sort((a, b) => a - b)
      medians.set(z, sorted[Math.floor(sorted.length / 2)] ?? 0)
    }

    // Bin-matching predicate: does observation match this stratum?
    const matchesBin = (
      obs: Record<string, number>,
      bin: number,
    ): boolean => {
      for (let z = 0; z < adjustmentSet.length && z < 5; z++) {
        const zVar = adjustmentSet[z]!
        const median = medians.get(zVar) ?? 0
        const obsZ = obs[zVar] ?? 0
        const binBit = (bin >> z) & 1
        if (binBit === 0 && obsZ > median) return false
        if (binBit === 1 && obsZ <= median) return false
      }
      return true
    }

    // Enumerate strata (2^|Z| bins for binary splits)
    const numBins = 1 << Math.min(adjustmentSet.length, 5)
    for (let bin = 0; bin < numBins; bin++) {
      // Find observations matching this bin + X ≈ xValue
      const matching = this.observations.filter(
        (obs) =>
          Math.abs((obs[x] ?? 0) - xValue) <= 0.5 && matchesBin(obs, bin),
      )

      if (matching.length === 0) continue

      // E[Y | X=x, Z=z] for this stratum
      const condMean =
        matching.reduce((sum, obs) => sum + (obs[y] ?? 0), 0) / matching.length

      // P(Z=z) — proportion of observations in this bin
      const allInBin = this.observations.filter((obs) => matchesBin(obs, bin))
      const pZ = allInBin.length / this.observations.length

      weightedSum += condMean * pZ
      totalWeight += pZ
    }

    return totalWeight > 0 ? weightedSum / totalWeight : this.naiveConditionalMean(x, xValue, y)
  }

  /** Simple conditional mean: E[Y | X ≈ x]. */
  private naiveConditionalMean(
    x: string,
    xValue: number,
    y: string,
  ): number {
    const matching = this.observations.filter(
      (obs) => Math.abs((obs[x] ?? 0) - xValue) < 0.5,
    )
    if (matching.length === 0) return 0
    return matching.reduce((sum, obs) => sum + (obs[y] ?? 0), 0) / matching.length
  }

  /**
   * Check if there's an active path from X to Y given observed set Z.
   * An active path has no node that is:
   * - A non-collider in Z, or
   * - A collider not in Z (and no descendant in Z)
   */
  private hasActivePath(
    x: string,
    y: string,
    z: Set<string>,
  ): boolean {
    // BFS through the graph checking for active paths
    // Simplified: check if there's any path not fully blocked
    const visited = new Set<string>()
    const queue = [x]

    while (queue.length > 0) {
      const current = queue.pop()!
      if (current === y) return true
      if (visited.has(current)) continue
      visited.add(current)

      // Don't traverse through Z (they block the path)
      if (z.has(current) && current !== x) continue

      // Follow edges in both directions
      const node = this.nodes.get(current)
      if (node === undefined) continue

      for (const child of node.children) {
        if (!visited.has(child)) queue.push(child)
      }
      for (const parent of node.parents) {
        if (!visited.has(parent)) queue.push(parent)
      }
    }

    return false
  }
}

// ── Utility ──

interface MutableCausalNode {
  readonly id: string
  readonly values: number[]
  parents: string[]
  children: string[]
}

/** Generate all combinations of size k from array. */
function combinations<T>(arr: readonly T[], k: number): T[][] {
  if (k === 0) return [[]]
  if (k > arr.length) return []

  const result: T[][] = []
  const combine = (start: number, current: T[]): void => {
    if (current.length === k) {
      result.push([...current])
      return
    }
    for (let i = start; i < arr.length; i++) {
      current.push(arr[i]!)
      combine(i + 1, current)
      current.pop()
    }
  }
  combine(0, [])
  return result
}
