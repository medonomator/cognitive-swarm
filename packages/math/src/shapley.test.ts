import { describe, it, expect } from 'vitest'
import { ShapleyValuator } from './shapley.js'

describe('ShapleyValuator', () => {
  describe('basic state', () => {
    it('handles empty agent list', () => {
      const sv = new ShapleyValuator([])
      const result = sv.computeExact()

      expect(result.values.size).toBe(0)
      expect(result.totalValue).toBe(0)
    })

    it('returns agent count', () => {
      const sv = new ShapleyValuator(['a1', 'a2', 'a3'])
      expect(sv.agentCount).toBe(3)
    })

    it('reset clears coalition values', () => {
      const sv = new ShapleyValuator(['a1', 'a2'])
      sv.setCoalitionValue(['a1'], 0.5)
      sv.reset()

      const result = sv.computeExact()
      // All values should be 0 (no coalition values set)
      for (const v of result.values.values()) {
        expect(v).toBe(0)
      }
    })
  })

  describe('computeExact', () => {
    it('single agent gets full value', () => {
      const sv = new ShapleyValuator(['a1'])
      sv.setCoalitionValue(['a1'], 1.0)

      const result = sv.computeExact()

      expect(result.values.get('a1')).toBeCloseTo(1.0, 5)
      expect(result.totalValue).toBe(1.0)
    })

    it('equal agents split value equally', () => {
      const sv = new ShapleyValuator(['a1', 'a2'])
      // Each alone: 0.5, together: 1.0
      sv.setCoalitionValue(['a1'], 0.5)
      sv.setCoalitionValue(['a2'], 0.5)
      sv.setCoalitionValue(['a1', 'a2'], 1.0)

      const result = sv.computeExact()

      expect(result.values.get('a1')).toBeCloseTo(0.5, 5)
      expect(result.values.get('a2')).toBeCloseTo(0.5, 5)
    })

    it('Shapley values sum to grand coalition value', () => {
      const sv = new ShapleyValuator(['a1', 'a2', 'a3'])
      sv.setCoalitionValue(['a1'], 0.3)
      sv.setCoalitionValue(['a2'], 0.2)
      sv.setCoalitionValue(['a3'], 0.1)
      sv.setCoalitionValue(['a1', 'a2'], 0.6)
      sv.setCoalitionValue(['a1', 'a3'], 0.5)
      sv.setCoalitionValue(['a2', 'a3'], 0.4)
      sv.setCoalitionValue(['a1', 'a2', 'a3'], 1.0)

      const result = sv.computeExact()

      let sum = 0
      for (const v of result.values.values()) sum += v

      expect(sum).toBeCloseTo(1.0, 5) // Sum = v(N)
      expect(result.totalValue).toBe(1.0)
    })

    it('detects redundant agent (zero marginal contribution)', () => {
      const sv = new ShapleyValuator(['a1', 'a2', 'a3'])
      // a3 adds nothing to any coalition
      sv.setCoalitionValue(['a1'], 0.5)
      sv.setCoalitionValue(['a2'], 0.5)
      sv.setCoalitionValue(['a3'], 0.0)
      sv.setCoalitionValue(['a1', 'a2'], 1.0)
      sv.setCoalitionValue(['a1', 'a3'], 0.5)
      sv.setCoalitionValue(['a2', 'a3'], 0.5)
      sv.setCoalitionValue(['a1', 'a2', 'a3'], 1.0)

      const result = sv.computeExact()

      expect(result.values.get('a3')).toBeCloseTo(0, 5)
      expect(result.values.get('a1')!).toBeGreaterThan(0)
      expect(result.values.get('a2')!).toBeGreaterThan(0)
    })

    it('values asymmetric contributions correctly', () => {
      const sv = new ShapleyValuator(['star', 'support'])
      // Star alone: high value. Support alone: low.
      // Together: slightly more than star alone.
      sv.setCoalitionValue(['star'], 0.8)
      sv.setCoalitionValue(['support'], 0.2)
      sv.setCoalitionValue(['star', 'support'], 1.0)

      const result = sv.computeExact()

      // Star should get more than support
      expect(result.values.get('star')!).toBeGreaterThan(
        result.values.get('support')!,
      )
    })
  })

  describe('computeApproximate', () => {
    it('approximates exact values for small games', () => {
      const sv = new ShapleyValuator(['a1', 'a2', 'a3'])

      sv.setValueFunction((coalition) => {
        // Superadditive: value grows more than linearly
        return coalition.length * 0.3 + (coalition.length >= 2 ? 0.1 : 0)
      })

      const exact = sv.computeExact()
      sv.reset()

      sv.setValueFunction((coalition) => {
        return coalition.length * 0.3 + (coalition.length >= 2 ? 0.1 : 0)
      })

      const approx = sv.computeApproximate(5000)

      // Approximate should be close to exact
      for (const agent of ['a1', 'a2', 'a3']) {
        expect(approx.values.get(agent)!).toBeCloseTo(
          exact.values.get(agent)!,
          1, // within 0.05
        )
      }
    })

    it('values sum to grand coalition value', () => {
      const sv = new ShapleyValuator(['a1', 'a2', 'a3', 'a4'])

      sv.setValueFunction((coalition) => coalition.length * 0.25)

      const result = sv.computeApproximate(2000)

      let sum = 0
      for (const v of result.values.values()) sum += v

      expect(sum).toBeCloseTo(result.totalValue, 1)
    })
  })

  describe('setValueFunction', () => {
    it('computes values dynamically', () => {
      const sv = new ShapleyValuator(['a1', 'a2'])

      sv.setValueFunction((coalition) => {
        if (coalition.length === 0) return 0
        if (coalition.length === 1) return 0.4
        return 1.0
      })

      const result = sv.computeExact()

      // Each agent adds 0.4 alone, and 0.6 marginal when joining the other
      // Shapley = (0.4 + 0.6) / 2 = 0.5
      expect(result.values.get('a1')).toBeCloseTo(0.5, 5)
      expect(result.values.get('a2')).toBeCloseTo(0.5, 5)
    })
  })

  describe('findRedundant', () => {
    it('identifies agents below threshold', () => {
      const sv = new ShapleyValuator(['a1', 'a2', 'a3'])
      sv.setCoalitionValue(['a1'], 0.5)
      sv.setCoalitionValue(['a2'], 0.5)
      sv.setCoalitionValue(['a3'], 0.0)
      sv.setCoalitionValue(['a1', 'a2'], 1.0)
      sv.setCoalitionValue(['a1', 'a3'], 0.5)
      sv.setCoalitionValue(['a2', 'a3'], 0.5)
      sv.setCoalitionValue(['a1', 'a2', 'a3'], 1.0)

      const redundant = sv.findRedundant(0.1)
      expect(redundant).toContain('a3')
      expect(redundant).not.toContain('a1')
      expect(redundant).not.toContain('a2')
    })
  })

  describe('optimalCoalition', () => {
    it('selects top-k agents by Shapley value', () => {
      const sv = new ShapleyValuator(['a1', 'a2', 'a3'])
      sv.setCoalitionValue(['a1'], 0.8)
      sv.setCoalitionValue(['a2'], 0.3)
      sv.setCoalitionValue(['a3'], 0.1)
      sv.setCoalitionValue(['a1', 'a2'], 0.9)
      sv.setCoalitionValue(['a1', 'a3'], 0.85)
      sv.setCoalitionValue(['a2', 'a3'], 0.4)
      sv.setCoalitionValue(['a1', 'a2', 'a3'], 1.0)

      const top2 = sv.optimalCoalition(2)

      expect(top2).toHaveLength(2)
      expect(top2[0]).toBe('a1') // highest Shapley value
    })

    it('returns all agents if k >= n', () => {
      const sv = new ShapleyValuator(['a1', 'a2'])
      sv.setCoalitionValue(['a1'], 0.5)
      sv.setCoalitionValue(['a2'], 0.5)
      sv.setCoalitionValue(['a1', 'a2'], 1.0)

      const all = sv.optimalCoalition(10)
      expect(all).toHaveLength(2)
    })
  })

  describe('shapleyValue', () => {
    it('returns value for single agent', () => {
      const sv = new ShapleyValuator(['a1', 'a2'])
      sv.setCoalitionValue(['a1'], 0.6)
      sv.setCoalitionValue(['a2'], 0.4)
      sv.setCoalitionValue(['a1', 'a2'], 1.0)

      const v = sv.shapleyValue('a1')
      expect(v).toBeGreaterThan(0)
    })

    it('returns 0 for unknown agent', () => {
      const sv = new ShapleyValuator(['a1'])
      sv.setCoalitionValue(['a1'], 1.0)

      expect(sv.shapleyValue('nonexistent')).toBe(0)
    })
  })
})
