import { describe, it, expect } from 'vitest'
import { ParticleSwarm } from './pso.js'

describe('ParticleSwarm', () => {
  it('creates empty swarm', () => {
    const pso = new ParticleSwarm(3)
    expect(pso.particleCount).toBe(0)
    expect(pso.iteration).toBe(0)
  })

  it('adds particles', () => {
    const pso = new ParticleSwarm(2)
    pso.addParticle('a1', [0.1, 0.2])
    pso.addParticle('a2', [0.8, 0.9])
    expect(pso.particleCount).toBe(2)
  })

  it('throws on wrong dimension', () => {
    const pso = new ParticleSwarm(3)
    expect(() => pso.addParticle('a1', [0.1, 0.2])).toThrow(
      '3 dimensions',
    )
  })

  it('tracks personal best', () => {
    const pso = new ParticleSwarm(2)
    pso.addParticle('a1', [0.5, 0.5])
    pso.updateFitness('a1', 0.8)

    const particle = pso.getParticle('a1')
    expect(particle?.pBestFitness).toBe(0.8)
    expect(particle?.pBest).toEqual([0.5, 0.5])
  })

  it('updates global best', () => {
    const pso = new ParticleSwarm(2)
    pso.addParticle('a1', [0.1, 0.2])
    pso.addParticle('a2', [0.8, 0.9])

    pso.updateFitness('a1', 0.5)
    pso.updateFitness('a2', 0.9)

    const gBest = pso.getGlobalBest()
    expect(gBest.fitness).toBe(0.9)
    expect(gBest.position).toEqual([0.8, 0.9])
  })

  it('step moves particles', () => {
    const pso = new ParticleSwarm(2, { inertia: 0.5, cognitiveCoeff: 1, socialCoeff: 1 })
    pso.addParticle('a1', [0.0, 0.0])
    pso.addParticle('a2', [1.0, 1.0])

    // a2 is the global best
    pso.updateFitness('a2', 1.0)

    const before = [...pso.getParticle('a1')!.position]
    pso.step()
    const after = [...pso.getParticle('a1')!.position]

    // a1 should have moved (attracted toward a2's position)
    const moved = before[0] !== after[0] || before[1] !== after[1]
    expect(moved).toBe(true)
    expect(pso.iteration).toBe(1)
  })

  it('step result includes diversity', () => {
    const pso = new ParticleSwarm(2)
    pso.addParticle('a1', [0, 0])
    pso.addParticle('a2', [1, 1])

    const result = pso.step()
    expect(result.diversity).toBeGreaterThanOrEqual(0)
    expect(result.particles).toHaveLength(2)
    expect(result.iteration).toBe(1)
  })

  it('particles converge toward global best over iterations', () => {
    const pso = new ParticleSwarm(2, {
      inertia: 0.3,
      cognitiveCoeff: 0.5,
      socialCoeff: 2.0,
      maxVelocity: 0.5,
    })
    pso.addParticle('a1', [0, 0])
    pso.addParticle('a2', [1, 1])

    // a2 is optimal
    pso.updateFitness('a2', 1.0)

    // Run several iterations
    let lastDiversity = Infinity
    for (let i = 0; i < 20; i++) {
      const result = pso.step()
      lastDiversity = result.diversity
    }

    // After many iterations with strong social pull,
    // diversity should decrease (particles converge)
    expect(lastDiversity).toBeLessThan(1.5)
  })

  it('maxVelocity prevents wild jumps', () => {
    const maxV = 0.1
    const pso = new ParticleSwarm(2, {
      maxVelocity: maxV,
      cognitiveCoeff: 10,
      socialCoeff: 10,
    })
    pso.addParticle('a1', [0, 0])
    pso.addParticle('a2', [100, 100])
    pso.updateFitness('a2', 1.0)

    pso.step()

    const particle = pso.getParticle('a1')!
    for (const v of particle.velocity) {
      expect(Math.abs(v)).toBeLessThanOrEqual(maxV + 1e-10)
    }
  })

  it('setPosition updates particle position', () => {
    const pso = new ParticleSwarm(2)
    pso.addParticle('a1', [0, 0])
    pso.setPosition('a1', [5, 5])

    expect(pso.getParticle('a1')?.position).toEqual([5, 5])
  })

  it('suggestExploration returns normalized direction', () => {
    const pso = new ParticleSwarm(2)
    pso.addParticle('a1', [0, 0])
    pso.addParticle('a2', [1, 0])

    const suggestion = pso.suggestExploration()
    const mag = Math.sqrt(
      suggestion.direction.reduce((s, v) => s + v * v, 0),
    )
    // Direction should be approximately normalized
    if (mag > 0) {
      expect(mag).toBeCloseTo(1.0, 1)
    }
  })

  it('reset clears all state', () => {
    const pso = new ParticleSwarm(2)
    pso.addParticle('a1', [0, 0])
    pso.step()
    pso.reset()

    expect(pso.particleCount).toBe(0)
    expect(pso.iteration).toBe(0)
    expect(pso.getGlobalBest().fitness).toBe(-Infinity)
  })

  it('single particle stays at pBest', () => {
    const pso = new ParticleSwarm(2, {
      inertia: 0,
      cognitiveCoeff: 1,
      socialCoeff: 0,
    })
    pso.addParticle('a1', [0.5, 0.5])
    pso.updateFitness('a1', 1.0)

    // With no inertia and no social pull, particle should stay at pBest
    pso.step()
    const p = pso.getParticle('a1')!
    expect(p.position[0]).toBeCloseTo(0.5, 5)
    expect(p.position[1]).toBeCloseTo(0.5, 5)
  })
})
