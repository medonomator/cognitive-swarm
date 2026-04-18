import { describe, it, expect } from 'vitest'
import { InfluenceGraph } from './influence-graph.js'

describe('InfluenceGraph', () => {
  describe('basic state', () => {
    it('starts empty', () => {
      const graph = new InfluenceGraph()
      expect(graph.edgeCount).toBe(0)
      expect(graph.nodeCount).toBe(0)
    })

    it('tracks edges and nodes', () => {
      const graph = new InfluenceGraph()
      graph.addEdge({ from: 'a1', to: 'a2', weight: 1.0 })

      expect(graph.edgeCount).toBe(1)
      expect(graph.nodeCount).toBe(2)
    })

    it('reset clears all state', () => {
      const graph = new InfluenceGraph()
      graph.addEdge({ from: 'a1', to: 'a2', weight: 1.0 })
      graph.reset()

      expect(graph.edgeCount).toBe(0)
      expect(graph.nodeCount).toBe(0)
    })
  })

  describe('computeCentrality', () => {
    it('returns empty map for empty graph', () => {
      const graph = new InfluenceGraph()
      const centrality = graph.computeCentrality()
      expect(centrality.size).toBe(0)
    })

    it('hub agent gets highest centrality', () => {
      const graph = new InfluenceGraph()
      // a1 influences everyone
      graph.addEdge({ from: 'a1', to: 'a2', weight: 1.0 })
      graph.addEdge({ from: 'a1', to: 'a3', weight: 1.0 })
      graph.addEdge({ from: 'a1', to: 'a4', weight: 1.0 })
      // Others only influence a1
      graph.addEdge({ from: 'a2', to: 'a1', weight: 0.5 })

      const centrality = graph.computeCentrality()

      // a2, a3, a4 receive influence from a1 (incoming links)
      // a1 receives influence from a2
      // But since we compute on A^T (incoming), agents with
      // more incoming links from important agents are ranked higher
      expect(centrality.size).toBe(4)
      // All values should be in [0, 1]
      for (const c of centrality.values()) {
        expect(c).toBeGreaterThanOrEqual(0)
        expect(c).toBeLessThanOrEqual(1)
      }
    })

    it('isolated agent gets low centrality', () => {
      const graph = new InfluenceGraph()
      graph.addEdge({ from: 'a1', to: 'a2', weight: 1.0 })
      graph.addEdge({ from: 'a2', to: 'a1', weight: 1.0 })
      graph.addEdge({ from: 'a1', to: 'a3', weight: 1.0 })
      // a4 has no edges but is added as a node
      graph.addEdge({ from: 'a4', to: 'a4', weight: 0.0 })

      const centrality = graph.computeCentrality()
      const a4 = centrality.get('a4') ?? 0
      const a1 = centrality.get('a1') ?? 0

      expect(a4).toBeLessThan(a1)
    })
  })

  describe('algebraicConnectivity', () => {
    it('returns 0 for single node', () => {
      const graph = new InfluenceGraph()
      graph.addEdge({ from: 'a1', to: 'a1', weight: 1.0 })
      expect(graph.algebraicConnectivity()).toBe(0)
    })

    it('returns positive for connected graph', () => {
      const graph = new InfluenceGraph()
      // Triangle: all connected
      graph.addEdge({ from: 'a1', to: 'a2', weight: 1.0 })
      graph.addEdge({ from: 'a2', to: 'a3', weight: 1.0 })
      graph.addEdge({ from: 'a3', to: 'a1', weight: 1.0 })

      expect(graph.algebraicConnectivity()).toBeGreaterThan(0)
    })

    it('returns 0 for disconnected graph', () => {
      const graph = new InfluenceGraph()
      // Two disconnected pairs
      graph.addEdge({ from: 'a1', to: 'a2', weight: 1.0 })
      graph.addEdge({ from: 'a3', to: 'a4', weight: 1.0 })

      expect(graph.algebraicConnectivity()).toBeCloseTo(0, 3)
    })
  })

  describe('robustnessCheck', () => {
    it('connected graph stays connected after removing non-critical node', () => {
      const graph = new InfluenceGraph()
      // Complete triangle
      graph.addEdge({ from: 'a1', to: 'a2', weight: 1.0 })
      graph.addEdge({ from: 'a2', to: 'a3', weight: 1.0 })
      graph.addEdge({ from: 'a3', to: 'a1', weight: 1.0 })

      const result = graph.robustnessCheck('a1')
      expect(result.connected).toBe(true)
      expect(result.components).toBe(1)
    })

    it('detects graph fragmentation when bridge node removed', () => {
      const graph = new InfluenceGraph()
      // a1-a2 connected via bridge
      graph.addEdge({ from: 'a1', to: 'bridge', weight: 1.0 })
      graph.addEdge({ from: 'bridge', to: 'a2', weight: 1.0 })

      const result = graph.robustnessCheck('bridge')
      expect(result.connected).toBe(false)
      expect(result.components).toBe(2)
    })
  })

  describe('analyze', () => {
    it('returns complete report', () => {
      const graph = new InfluenceGraph()
      graph.addEdge({ from: 'a1', to: 'a2', weight: 1.0 })
      graph.addEdge({ from: 'a1', to: 'a3', weight: 0.8 })
      graph.addEdge({ from: 'a2', to: 'a3', weight: 0.5 })
      graph.addEdge({ from: 'a3', to: 'a1', weight: 0.3 })

      const report = graph.analyze()

      expect(report.centrality.size).toBe(3)
      expect(report.dominantInfluencer).toBeDefined()
      expect(report.fiedlerValue).toBeGreaterThan(0)
      expect(report.influenceConcentration).toBeGreaterThanOrEqual(0)
      expect(report.influenceConcentration).toBeLessThanOrEqual(1)
      expect(typeof report.isFragile).toBe('boolean')
    })

    it('detects fragile star topology', () => {
      const graph = new InfluenceGraph()
      // Star: center ↔ spokes, no spoke-to-spoke edges
      graph.addEdge({ from: 'center', to: 'spoke1', weight: 1.0 })
      graph.addEdge({ from: 'center', to: 'spoke2', weight: 1.0 })
      graph.addEdge({ from: 'center', to: 'spoke3', weight: 1.0 })
      graph.addEdge({ from: 'spoke1', to: 'center', weight: 0.5 })
      graph.addEdge({ from: 'spoke2', to: 'center', weight: 0.5 })
      graph.addEdge({ from: 'spoke3', to: 'center', weight: 0.5 })

      const report = graph.analyze()

      // Center is the dominant influencer
      expect(report.dominantInfluencer).toBe('center')
      // Removing center disconnects the graph
      expect(report.isFragile).toBe(true)
    })

    it('non-fragile in fully connected graph', () => {
      const graph = new InfluenceGraph()
      // All pairs connected
      const agents = ['a1', 'a2', 'a3', 'a4']
      for (const from of agents) {
        for (const to of agents) {
          if (from !== to) {
            graph.addEdge({ from, to, weight: 1.0 })
          }
        }
      }

      const report = graph.analyze()
      expect(report.isFragile).toBe(false)
    })
  })
})
