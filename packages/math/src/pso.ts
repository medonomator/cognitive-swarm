// Particle Swarm Optimization (PSO) for exploring solution space.
// v(t+1) = w*v(t) + c1*r1*(pBest - x) + c2*r2*(gBest - x)
// x(t+1) = x(t) + v(t+1)

/** Configuration for the PSO algorithm. */
export interface PSOConfig {
  /** Inertia weight. (0, 1) */
  readonly inertia: number
  /** Cognitive coefficient - attraction to personal best. */
  readonly cognitiveCoeff: number
  /** Social coefficient - attraction to global best. */
  readonly socialCoeff: number
  /** Maximum velocity magnitude (prevents wild jumps). */
  readonly maxVelocity: number
}

/** A particle in the swarm. */
export interface Particle {
  /** Unique identifier (agent ID). */
  readonly id: string
  /** Current position in solution space (embedding vector). */
  position: readonly number[]
  /** Current velocity vector. */
  velocity: readonly number[]
  /** Personal best position found. */
  pBest: readonly number[]
  /** Fitness at personal best position. */
  pBestFitness: number
}

/** Result of one PSO step. */
export interface PSOStepResult {
  /** Updated particles. */
  readonly particles: readonly Particle[]
  /** Current global best position. */
  readonly gBest: readonly number[]
  /** Current global best fitness. */
  readonly gBestFitness: number
  /** Average distance between particles (diversity measure). */
  readonly diversity: number
  /** Iteration number. */
  readonly iteration: number
}

const DEFAULT_PSO_CONFIG: PSOConfig = {
  inertia: 0.7,
  cognitiveCoeff: 1.5,
  socialCoeff: 1.5,
  maxVelocity: 1.0,
}

/**
 * Particle Swarm Optimization for exploring solution space.
 *
 * Each agent is a particle that moves through embedding space,
 * attracted to both its own best-known solution and the
 * globally best-known solution. Inertia preserves diversity.
 *
 * Usage:
 * ```ts
 * const pso = new ParticleSwarm(3)  // 3-dimensional space
 * pso.addParticle('agent-1', [0.1, 0.2, 0.3])
 * pso.addParticle('agent-2', [0.8, 0.7, 0.6])
 *
 * // Agent-1 found a good solution (fitness = 0.9)
 * pso.updateFitness('agent-1', 0.9)
 *
 * const result = pso.step()  // Move all particles
 * // Particles attracted toward agent-1's position
 * ```
 */
export class ParticleSwarm {
  private readonly dimensions: number
  private readonly config: PSOConfig
  private readonly particles = new Map<string, Particle>()
  private gBest: number[]
  private gBestFitness = -Infinity
  private _iteration = 0

  constructor(dimensions: number, config?: Partial<PSOConfig>) {
    this.dimensions = dimensions
    this.config = { ...DEFAULT_PSO_CONFIG, ...config }
    this.gBest = new Array<number>(dimensions).fill(0)
  }

  addParticle(id: string, position: readonly number[]): void {
    if (position.length !== this.dimensions) {
      throw new Error(
        `Position must have ${this.dimensions} dimensions, got ${position.length}`,
      )
    }

    const particle: Particle = {
      id,
      position: [...position],
      velocity: new Array<number>(this.dimensions).fill(0),
      pBest: [...position],
      pBestFitness: -Infinity,
    }

    this.particles.set(id, particle)
  }

  /**
   * Update a particle's fitness at its current position.
   * If this is a new personal best, updates pBest.
   * If this is a new global best, updates gBest.
   */
  updateFitness(id: string, fitness: number): void {
    const particle = this.particles.get(id)
    if (!particle) return

    if (fitness > particle.pBestFitness) {
      particle.pBest = [...particle.position]
      particle.pBestFitness = fitness
    }

    if (fitness > this.gBestFitness) {
      this.gBest = [...particle.position]
      this.gBestFitness = fitness
    }
  }

  /**
   * Move a particle to a new position (e.g., after LLM generates
   * a new answer and it gets embedded).
   */
  setPosition(id: string, position: readonly number[]): void {
    const particle = this.particles.get(id)
    if (!particle) return
    particle.position = [...position]
  }

  /**
   * Execute one PSO step - update velocities and positions
   * for all particles.
   *
   * v(t+1) = w·v(t) + c₁·r₁·(pBest - x) + c₂·r₂·(gBest - x)
   * x(t+1) = x(t) + v(t+1)
   */
  step(): PSOStepResult {
    this._iteration++

    for (const particle of this.particles.values()) {
      const newVelocity = new Array<number>(this.dimensions)
      const newPosition = new Array<number>(this.dimensions)

      for (let d = 0; d < this.dimensions; d++) {
        const r1 = Math.random()
        const r2 = Math.random()

        // Velocity update
        const inertia = this.config.inertia * particle.velocity[d]!
        const cognitive =
          this.config.cognitiveCoeff *
          r1 *
          (particle.pBest[d]! - particle.position[d]!)
        const social =
          this.config.socialCoeff *
          r2 *
          (this.gBest[d]! - particle.position[d]!)

        let v = inertia + cognitive + social

        // Clamp velocity
        v = Math.max(
          -this.config.maxVelocity,
          Math.min(this.config.maxVelocity, v),
        )

        newVelocity[d] = v
        newPosition[d] = particle.position[d]! + v
      }

      particle.velocity = newVelocity
      particle.position = newPosition
    }

    return {
      particles: [...this.particles.values()],
      gBest: [...this.gBest],
      gBestFitness: this.gBestFitness,
      diversity: this.computeDiversity(),
      iteration: this._iteration,
    }
  }

  /**
   * Suggest which region of solution space is least explored.
   * Returns the direction from the centroid that is farthest
   * from any particle.
   */
  suggestExploration(): {
    direction: readonly number[]
    centroid: readonly number[]
  } {
    const centroid = this.computeCentroid()

    // Find the particle farthest from centroid
    let maxDist = 0
    let farthestDir = new Array<number>(this.dimensions).fill(0)

    for (const particle of this.particles.values()) {
      let dist = 0
      const dir = new Array<number>(this.dimensions)

      for (let d = 0; d < this.dimensions; d++) {
        const diff = particle.position[d]! - centroid[d]!
        dir[d] = diff
        dist += diff * diff
      }

      dist = Math.sqrt(dist)
      if (dist > maxDist) {
        maxDist = dist
        farthestDir = dir
      }
    }

    // Suggest exploring OPPOSITE to the most explored direction
    // (the direction where the farthest particle is = most explored)
    const opposite = farthestDir.map((v) => -v)

    // Normalize
    let mag = 0
    for (const v of opposite) mag += v * v
    mag = Math.sqrt(mag)

    const normalized =
      mag > 0 ? opposite.map((v) => v / mag) : opposite

    return { direction: normalized, centroid }
  }

  getGlobalBest(): {
    position: readonly number[]
    fitness: number
  } {
    return { position: [...this.gBest], fitness: this.gBestFitness }
  }

  getParticle(id: string): Particle | undefined {
    return this.particles.get(id)
  }

  get particleCount(): number {
    return this.particles.size
  }

  get iteration(): number {
    return this._iteration
  }

  reset(): void {
    this.particles.clear()
    this.gBest = new Array<number>(this.dimensions).fill(0)
    this.gBestFitness = -Infinity
    this._iteration = 0
  }

  /** Compute centroid (average position) of all particles. */
  private computeCentroid(): number[] {
    const centroid = new Array<number>(this.dimensions).fill(0)
    const n = this.particles.size
    if (n === 0) return centroid

    for (const particle of this.particles.values()) {
      for (let d = 0; d < this.dimensions; d++) {
        centroid[d]! += particle.position[d]!
      }
    }

    for (let d = 0; d < this.dimensions; d++) {
      centroid[d] = centroid[d]! / n
    }

    return centroid
  }

  /**
   * Compute average pairwise distance between particles.
   * Measures diversity - low diversity = swarm converged.
   */
  private computeDiversity(): number {
    const particles = [...this.particles.values()]
    const n = particles.length
    if (n < 2) return 0

    let totalDist = 0
    let pairs = 0

    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        let dist = 0
        for (let d = 0; d < this.dimensions; d++) {
          const diff =
            particles[i]!.position[d]! - particles[j]!.position[d]!
          dist += diff * diff
        }
        totalDist += Math.sqrt(dist)
        pairs++
      }
    }

    return totalDist / pairs
  }
}
