// Topological data analysis - finds clusters, gaps, and persistent features
// in proposal embedding space via simplified persistent homology.

/** A point in the solution space with metadata. */
export interface TopologyPoint {
  readonly id: string
  readonly embedding: readonly number[]
  readonly label?: string
}

/** A cluster of similar points. */
export interface Cluster {
  readonly id: number
  readonly points: readonly TopologyPoint[]
  readonly centroid: readonly number[]
  /** Average within-cluster distance. */
  readonly diameter: number
}

/** A gap between clusters (unexplored region). */
export interface Gap {
  /** The two clusters with a gap between them. */
  readonly clusterA: number
  readonly clusterB: number
  /** Midpoint of the gap (suggested exploration target). */
  readonly midpoint: readonly number[]
  /** Distance between cluster centroids. */
  readonly distance: number
}

/** A persistence pair: (birth, death) of a topological feature. */
export interface PersistencePair {
  /** Distance threshold at which the feature appeared. */
  readonly birth: number
  /** Distance threshold at which the feature merged/disappeared. */
  readonly death: number
  /** Lifetime = death - birth. Longer = more significant. */
  readonly persistence: number
  /** Which dimension: 0 = connected component, 1 = loop (not implemented). */
  readonly dimension: 0
}

/**
 * Topological analysis of solution space.
 *
 * Finds clusters, gaps, and persistent features in the
 * embedding space of proposals. Helps the swarm understand
 * WHERE ideas are concentrated and where gaps exist.
 *
 * Usage:
 * ```ts
 * const tda = new TopologyAnalyzer()
 * tda.addPoint({ id: 'p1', embedding: [0.1, 0.2] })
 * tda.addPoint({ id: 'p2', embedding: [0.15, 0.22] })
 * tda.addPoint({ id: 'p3', embedding: [0.9, 0.8] })
 *
 * const clusters = tda.findClusters(0.3) // distance threshold
 * // -> 2 clusters: {p1, p2} and {p3}
 *
 * const gaps = tda.findGaps(0.3)
 * // -> gap between the two clusters, with midpoint suggestion
 * ```
 */
export class TopologyAnalyzer {
  private readonly points: TopologyPoint[] = []

  addPoint(point: TopologyPoint): void {
    this.points.push(point)
  }

  addPoints(points: readonly TopologyPoint[]): void {
    for (const p of points) this.points.push(p)
  }

  /**
   * Find clusters using single-linkage hierarchical clustering.
   * Points within `threshold` distance are connected.
   *
   * @param threshold - maximum distance to consider points connected
   */
  findClusters(threshold: number): readonly Cluster[] {
    if (this.points.length === 0) return []

    // Union-Find for clustering
    const parent = new Map<number, number>()
    for (let i = 0; i < this.points.length; i++) {
      parent.set(i, i)
    }

    const find = (x: number): number => {
      let root = x
      while (parent.get(root) !== root) {
        root = parent.get(root)!
      }
      // Path compression
      let current = x
      while (current !== root) {
        const next = parent.get(current)!
        parent.set(current, root)
        current = next
      }
      return root
    }

    const union = (a: number, b: number): void => {
      const rootA = find(a)
      const rootB = find(b)
      if (rootA !== rootB) {
        parent.set(rootB, rootA)
      }
    }

    // Connect points within threshold
    for (let i = 0; i < this.points.length; i++) {
      for (let j = i + 1; j < this.points.length; j++) {
        const dist = euclidean(
          this.points[i]!.embedding,
          this.points[j]!.embedding,
        )
        if (dist <= threshold) {
          union(i, j)
        }
      }
    }

    // Group by root
    const groups = new Map<number, number[]>()
    for (let i = 0; i < this.points.length; i++) {
      const root = find(i)
      let group = groups.get(root)
      if (!group) {
        group = []
        groups.set(root, group)
      }
      group.push(i)
    }

    // Build cluster objects
    let clusterId = 0
    const clusters: Cluster[] = []

    for (const indices of groups.values()) {
      const clusterPoints = indices.map((i) => this.points[i]!)
      const centroid = computeCentroid(
        clusterPoints.map((p) => p.embedding),
      )
      const diameter = computeDiameter(
        clusterPoints.map((p) => p.embedding),
      )

      clusters.push({
        id: clusterId++,
        points: clusterPoints,
        centroid,
        diameter,
      })
    }

    return clusters
  }

  /**
   * Find gaps between clusters (unexplored regions).
   *
   * Returns gaps sorted by distance (largest gap first).
   */
  findGaps(clusterThreshold: number): readonly Gap[] {
    const clusters = this.findClusters(clusterThreshold)
    if (clusters.length < 2) return []

    const gaps: Gap[] = []

    for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        const cA = clusters[i]!
        const cB = clusters[j]!

        const distance = euclidean(cA.centroid, cB.centroid)
        const midpoint = computeMidpoint(cA.centroid, cB.centroid)

        gaps.push({
          clusterA: cA.id,
          clusterB: cB.id,
          midpoint,
          distance,
        })
      }
    }

    // Sort by distance descending (largest gaps first)
    gaps.sort((a, b) => b.distance - a.distance)
    return gaps
  }

  /**
   * Compute persistence diagram (dimension 0 - connected components).
   *
   * Tracks when connected components merge as the distance
   * threshold increases. Long-lived components represent
   * real clusters; short-lived ones are noise.
   */
  persistenceDiagram(): readonly PersistencePair[] {
    if (this.points.length < 2) return []

    // Compute all pairwise distances and sort
    const edges: { i: number; j: number; dist: number }[] = []
    for (let i = 0; i < this.points.length; i++) {
      for (let j = i + 1; j < this.points.length; j++) {
        edges.push({
          i,
          j,
          dist: euclidean(
            this.points[i]!.embedding,
            this.points[j]!.embedding,
          ),
        })
      }
    }
    edges.sort((a, b) => a.dist - b.dist)

    // Union-Find with birth tracking
    const parent = new Map<number, number>()
    const rank = new Map<number, number>()
    const birth = new Map<number, number>() // birth time per component

    for (let i = 0; i < this.points.length; i++) {
      parent.set(i, i)
      rank.set(i, 0)
      birth.set(i, 0) // all components born at distance 0
    }

    const find = (x: number): number => {
      let root = x
      while (parent.get(root) !== root) root = parent.get(root)!
      let current = x
      while (current !== root) {
        const next = parent.get(current)!
        parent.set(current, root)
        current = next
      }
      return root
    }

    const pairs: PersistencePair[] = []

    // Process edges in order of increasing distance
    for (const edge of edges) {
      const rootA = find(edge.i)
      const rootB = find(edge.j)

      if (rootA === rootB) continue // Already connected

      // Merge: younger component dies (larger birth time)
      const birthA = birth.get(rootA) ?? 0
      const birthB = birth.get(rootB) ?? 0

      // The younger one dies
      const dying = birthA > birthB ? rootA : rootB
      const surviving = dying === rootA ? rootB : rootA

      pairs.push({
        birth: birth.get(dying)!,
        death: edge.dist,
        persistence: edge.dist - birth.get(dying)!,
        dimension: 0,
      })

      // Union by rank
      const rankA = rank.get(surviving) ?? 0
      const rankB = rank.get(dying) ?? 0
      if (rankA < rankB) {
        parent.set(surviving, dying)
        birth.set(dying, Math.min(birthA, birthB))
      } else if (rankA > rankB) {
        parent.set(dying, surviving)
      } else {
        parent.set(dying, surviving)
        rank.set(surviving, rankA + 1)
      }
    }

    // Sort by persistence (most significant first)
    pairs.sort((a, b) => b.persistence - a.persistence)
    return pairs
  }

  /**
   * Suggest where to explore next based on gap analysis.
   *
   * Returns the midpoint of the largest gap between clusters,
   * giving the swarm a direction to investigate unexplored territory.
   */
  suggestExploration(
    clusterThreshold: number,
  ): { direction: readonly number[]; reason: string } | null {
    const gaps = this.findGaps(clusterThreshold)
    if (gaps.length === 0) return null

    const largestGap = gaps[0]!
    return {
      direction: largestGap.midpoint,
      reason: `Gap between cluster ${largestGap.clusterA} and ${largestGap.clusterB} (distance: ${largestGap.distance.toFixed(3)})`,
    }
  }

  get pointCount(): number {
    return this.points.length
  }

  reset(): void {
    this.points.length = 0
  }
}

function euclidean(a: readonly number[], b: readonly number[]): number {
  let sum = 0
  for (let i = 0; i < a.length; i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0)
    sum += diff * diff
  }
  return Math.sqrt(sum)
}

function computeCentroid(
  vectors: readonly (readonly number[])[],
): readonly number[] {
  if (vectors.length === 0) return []
  const dims = vectors[0]!.length
  const result = new Array<number>(dims).fill(0)

  for (const v of vectors) {
    for (let d = 0; d < dims; d++) {
      result[d]! += v[d] ?? 0
    }
  }

  for (let d = 0; d < dims; d++) {
    result[d] = result[d]! / vectors.length
  }

  return result
}

function computeMidpoint(
  a: readonly number[],
  b: readonly number[],
): readonly number[] {
  const dims = Math.max(a.length, b.length)
  const result = new Array<number>(dims)
  for (let d = 0; d < dims; d++) {
    result[d] = ((a[d] ?? 0) + (b[d] ?? 0)) / 2
  }
  return result
}

function computeDiameter(
  vectors: readonly (readonly number[])[],
): number {
  let maxDist = 0
  for (let i = 0; i < vectors.length; i++) {
    for (let j = i + 1; j < vectors.length; j++) {
      const dist = euclidean(vectors[i]!, vectors[j]!)
      if (dist > maxDist) maxDist = dist
    }
  }
  return maxDist
}
