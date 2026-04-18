import { describe, it, expect } from 'vitest'
import { TopologyAnalyzer } from './topology.js'

describe('TopologyAnalyzer', () => {
  it('starts empty', () => {
    const tda = new TopologyAnalyzer()
    expect(tda.pointCount).toBe(0)
  })

  it('adds points', () => {
    const tda = new TopologyAnalyzer()
    tda.addPoint({ id: 'p1', embedding: [0, 0] })
    tda.addPoint({ id: 'p2', embedding: [1, 1] })
    expect(tda.pointCount).toBe(2)
  })

  it('finds single cluster when all points are close', () => {
    const tda = new TopologyAnalyzer()
    tda.addPoint({ id: 'p1', embedding: [0.1, 0.1] })
    tda.addPoint({ id: 'p2', embedding: [0.15, 0.12] })
    tda.addPoint({ id: 'p3', embedding: [0.12, 0.14] })

    const clusters = tda.findClusters(0.2)
    expect(clusters).toHaveLength(1)
    expect(clusters[0]!.points).toHaveLength(3)
  })

  it('finds multiple clusters when points are far apart', () => {
    const tda = new TopologyAnalyzer()
    // Cluster 1
    tda.addPoint({ id: 'p1', embedding: [0, 0] })
    tda.addPoint({ id: 'p2', embedding: [0.05, 0.05] })
    // Cluster 2
    tda.addPoint({ id: 'p3', embedding: [1, 1] })
    tda.addPoint({ id: 'p4', embedding: [1.05, 1.05] })

    const clusters = tda.findClusters(0.2)
    expect(clusters).toHaveLength(2)
  })

  it('cluster centroids are correct', () => {
    const tda = new TopologyAnalyzer()
    tda.addPoint({ id: 'p1', embedding: [0, 0] })
    tda.addPoint({ id: 'p2', embedding: [2, 2] })

    const clusters = tda.findClusters(0.5) // Too far apart -> 2 clusters
    expect(clusters).toHaveLength(2)

    // Each cluster has one point -> centroid = point
    for (const c of clusters) {
      expect(c.centroid).toEqual(c.points[0]!.embedding)
    }
  })

  it('finds gaps between clusters', () => {
    const tda = new TopologyAnalyzer()
    tda.addPoint({ id: 'p1', embedding: [0, 0] })
    tda.addPoint({ id: 'p2', embedding: [0.1, 0.1] })
    tda.addPoint({ id: 'p3', embedding: [5, 5] })
    tda.addPoint({ id: 'p4', embedding: [5.1, 5.1] })

    const gaps = tda.findGaps(0.3)
    expect(gaps).toHaveLength(1)
    expect(gaps[0]!.distance).toBeGreaterThan(4)
  })

  it('gap midpoints are between clusters', () => {
    const tda = new TopologyAnalyzer()
    tda.addPoint({ id: 'p1', embedding: [0, 0] })
    tda.addPoint({ id: 'p2', embedding: [10, 10] })

    const gaps = tda.findGaps(0.5)
    expect(gaps).toHaveLength(1)
    expect(gaps[0]!.midpoint[0]).toBeCloseTo(5, 1)
    expect(gaps[0]!.midpoint[1]).toBeCloseTo(5, 1)
  })

  it('gaps are sorted by distance descending', () => {
    const tda = new TopologyAnalyzer()
    tda.addPoint({ id: 'p1', embedding: [0, 0] })
    tda.addPoint({ id: 'p2', embedding: [3, 0] })
    tda.addPoint({ id: 'p3', embedding: [10, 0] })

    const gaps = tda.findGaps(0.5)
    expect(gaps.length).toBeGreaterThanOrEqual(2)
    // First gap should be largest
    expect(gaps[0]!.distance).toBeGreaterThanOrEqual(gaps[1]!.distance)
  })

  it('persistenceDiagram returns sorted pairs', () => {
    const tda = new TopologyAnalyzer()
    tda.addPoint({ id: 'p1', embedding: [0, 0] })
    tda.addPoint({ id: 'p2', embedding: [0.1, 0] })
    tda.addPoint({ id: 'p3', embedding: [5, 0] })

    const diagram = tda.persistenceDiagram()
    expect(diagram.length).toBeGreaterThan(0)

    // Sorted by persistence descending
    for (let i = 1; i < diagram.length; i++) {
      expect(diagram[i]!.persistence).toBeLessThanOrEqual(
        diagram[i - 1]!.persistence,
      )
    }
  })

  it('persistent features have long lifetime', () => {
    const tda = new TopologyAnalyzer()
    // Two well-separated clusters
    tda.addPoint({ id: 'p1', embedding: [0, 0] })
    tda.addPoint({ id: 'p2', embedding: [0.01, 0.01] })
    tda.addPoint({ id: 'p3', embedding: [10, 10] })
    tda.addPoint({ id: 'p4', embedding: [10.01, 10.01] })

    const diagram = tda.persistenceDiagram()
    // Most persistent feature: the two clusters merging at high distance
    expect(diagram[0]!.persistence).toBeGreaterThan(5)
    // Least persistent: points within a cluster merging
    const last = diagram[diagram.length - 1]!
    expect(last.persistence).toBeLessThan(1)
  })

  it('all persistence pairs have dimension 0', () => {
    const tda = new TopologyAnalyzer()
    tda.addPoints([
      { id: 'a', embedding: [0, 0] },
      { id: 'b', embedding: [1, 1] },
      { id: 'c', embedding: [2, 2] },
    ])

    const diagram = tda.persistenceDiagram()
    for (const pair of diagram) {
      expect(pair.dimension).toBe(0)
    }
  })

  it('suggestExploration returns largest gap midpoint', () => {
    const tda = new TopologyAnalyzer()
    tda.addPoint({ id: 'p1', embedding: [0, 0] })
    tda.addPoint({ id: 'p2', embedding: [10, 10] })

    const suggestion = tda.suggestExploration(0.5)
    expect(suggestion).not.toBeNull()
    expect(suggestion!.direction[0]).toBeCloseTo(5, 1)
    expect(suggestion!.reason).toContain('Gap')
  })

  it('suggestExploration returns null for single cluster', () => {
    const tda = new TopologyAnalyzer()
    tda.addPoint({ id: 'p1', embedding: [0, 0] })
    tda.addPoint({ id: 'p2', embedding: [0.01, 0.01] })

    const suggestion = tda.suggestExploration(0.5)
    expect(suggestion).toBeNull()
  })

  it('handles empty point set', () => {
    const tda = new TopologyAnalyzer()
    expect(tda.findClusters(0.5)).toHaveLength(0)
    expect(tda.findGaps(0.5)).toHaveLength(0)
    expect(tda.persistenceDiagram()).toHaveLength(0)
  })

  it('reset clears all points', () => {
    const tda = new TopologyAnalyzer()
    tda.addPoint({ id: 'p1', embedding: [0, 0] })
    tda.reset()
    expect(tda.pointCount).toBe(0)
  })

  it('works in high dimensions', () => {
    const tda = new TopologyAnalyzer()
    const dim = 128
    tda.addPoint({ id: 'p1', embedding: new Array(dim).fill(0) })
    tda.addPoint({ id: 'p2', embedding: new Array(dim).fill(1) })

    const clusters = tda.findClusters(5) // threshold relative to sqrt(128)
    expect(clusters.length).toBeGreaterThan(0)
  })
})
