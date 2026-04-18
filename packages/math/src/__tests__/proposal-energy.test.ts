import { describe, it, expect } from 'vitest'
import { ProposalEnergyTracker } from '../proposal-energy.js'

describe('ProposalEnergyTracker', () => {
  it('empty tracker report has no proposals and null leader', () => {
    const t = new ProposalEnergyTracker()
    const r = t.report()

    expect(r.proposals).toHaveLength(0)
    expect(r.leader).toBeNull()
    expect(r.risingFastest).toBeNull()
    expect(r.totalEnergy).toBe(0)
    expect(r.clearLeader).toBe(false)
  })

  it('single proposal gains energy through agree votes', () => {
    const t = new ProposalEnergyTracker(0) // no decay for clarity

    t.recordVote('A', 'agree', 0.8)
    t.recordVote('A', 'agree', 0.7)
    t.endRound()

    const r = t.report()
    expect(r.proposals).toHaveLength(1)

    const a = r.proposals[0]!
    expect(a.proposalId).toBe('A')
    expect(a.energy).toBe(1.5)
    expect(a.trend).toBe('rising')
    expect(r.leader).toBe('A')
  })

  it('competing proposals: agrees beat disagrees', () => {
    const t = new ProposalEnergyTracker(0)

    // A gets agrees, B gets disagrees
    t.recordVote('A', 'agree', 1.0)
    t.recordVote('A', 'agree', 0.8)
    t.recordVote('B', 'agree', 0.3)
    t.recordVote('B', 'disagree', 0.5)
    t.endRound()

    const r = t.report()
    expect(r.leader).toBe('A')

    const a = r.proposals.find(p => p.proposalId === 'A')!
    const b = r.proposals.find(p => p.proposalId === 'B')!
    expect(a.energy).toBeGreaterThan(b.energy)
  })

  it('energy decays when proposal receives no votes', () => {
    const decay = 0.1
    const t = new ProposalEnergyTracker(decay)

    // Give proposal some initial energy
    t.recordVote('A', 'agree', 1.0)
    t.endRound()

    const energyAfterR1 = t.report().proposals[0]!.energy

    // No votes in round 2 — energy should drop by decay
    t.endRound()

    const energyAfterR2 = t.report().proposals[0]!.energy
    expect(energyAfterR2).toBeLessThan(energyAfterR1)
    expect(energyAfterR2).toBeCloseTo(energyAfterR1 - decay, 10)
  })

  it('momentum tracks trend via EMA — rising then stopping shows declining momentum', () => {
    const t = new ProposalEnergyTracker(0)

    // Build up momentum with several rounds of agrees
    for (let i = 0; i < 5; i++) {
      t.recordVote('A', 'agree', 1.0)
      t.endRound()
    }

    const risingReport = t.report()
    const risingMomentum = risingReport.proposals[0]!.momentum
    expect(risingMomentum).toBeGreaterThan(0)
    expect(risingReport.proposals[0]!.trend).toBe('rising')

    // Now stop voting — energy stays flat (no decay), delta = 0
    // Momentum should decay toward 0 via EMA
    for (let i = 0; i < 20; i++) {
      t.endRound()
    }

    const laterReport = t.report()
    const laterMomentum = laterReport.proposals[0]!.momentum
    expect(laterMomentum).toBeLessThan(risingMomentum)
    // After enough rounds with delta=0, momentum should be near zero
    expect(Math.abs(laterMomentum)).toBeLessThan(0.05)
    expect(laterReport.proposals[0]!.trend).toBe('stable')
  })

  it('clearLeader is true when leader energy > 2× second place', () => {
    const t = new ProposalEnergyTracker(0)

    // Give A much more energy than B
    t.recordVote('A', 'agree', 3.0)
    t.recordVote('B', 'agree', 0.5)
    t.endRound()

    const r = t.report()
    expect(r.clearLeader).toBe(true)
    expect(r.leader).toBe('A')
  })

  it('clearLeader is false when proposals are close', () => {
    const t = new ProposalEnergyTracker(0)

    t.recordVote('A', 'agree', 1.0)
    t.recordVote('B', 'agree', 0.9)
    t.endRound()

    expect(t.report().clearLeader).toBe(false)
  })

  it('risingFastest identifies proposal with highest momentum', () => {
    const t = new ProposalEnergyTracker(0)

    // A gets small consistent support
    t.recordVote('A', 'agree', 0.3)
    t.recordVote('B', 'agree', 0.1)
    t.endRound()

    // B gets a big surge
    t.recordVote('A', 'agree', 0.3)
    t.recordVote('B', 'agree', 2.0)
    t.endRound()

    const r = t.report()
    expect(r.risingFastest).toBe('B')
  })

  it('reset() clears all state', () => {
    const t = new ProposalEnergyTracker()

    t.recordVote('A', 'agree', 1.0)
    t.recordVote('B', 'agree', 0.5)
    t.endRound()

    expect(t.proposalCount).toBe(2)

    t.reset()

    expect(t.proposalCount).toBe(0)
    const r = t.report()
    expect(r.proposals).toHaveLength(0)
    expect(r.leader).toBeNull()
    expect(r.totalEnergy).toBe(0)
  })

  it('energy floor is zero — cannot go negative', () => {
    const t = new ProposalEnergyTracker(0)

    t.recordVote('A', 'agree', 0.5)
    t.endRound()

    t.recordVote('A', 'disagree', 10.0)
    t.endRound()

    expect(t.report().proposals[0]!.energy).toBe(0)
  })
})
