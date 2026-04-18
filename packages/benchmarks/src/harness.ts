import type { MathAnalysis } from '@cognitive-swarm/core'
import type {
  BenchmarkResult,
  RunResult,
  Comparison,
  BenchmarkReport,
  ModelPricing,
} from './types.js'

/** GPT-4o-mini pricing (as of 2024). */
export const GPT4O_MINI_PRICING: ModelPricing = {
  inputPer1M: 0.15,
  outputPer1M: 0.6,
}

/**
 * Estimate cost in USD from token counts.
 * Simplified: assumes 70% input, 30% output ratio.
 */
export function estimateCost(
  tokens: number,
  pricing: ModelPricing = GPT4O_MINI_PRICING,
): number {
  const inputTokens = tokens * 0.7
  const outputTokens = tokens * 0.3
  return (
    (inputTokens / 1_000_000) * pricing.inputPer1M +
    (outputTokens / 1_000_000) * pricing.outputPer1M
  )
}

/**
 * Compare swarm vs baseline results.
 */
export function compare(
  swarm: RunResult,
  baseline: RunResult,
): Comparison {
  const scoreDelta = swarm.score - baseline.score
  const costRatio = baseline.costUsd > 0 ? swarm.costUsd / baseline.costUsd : 1
  const speedRatio =
    baseline.durationMs > 0 ? swarm.durationMs / baseline.durationMs : 1

  const swarmQpd = swarm.costUsd > 0 ? swarm.score / swarm.costUsd : Infinity
  const baselineQpd =
    baseline.costUsd > 0 ? baseline.score / baseline.costUsd : Infinity
  const qualityPerDollar = baselineQpd > 0 ? swarmQpd / baselineQpd : 1

  let winner: 'swarm' | 'baseline' | 'tie' = 'tie'
  if (scoreDelta > 0.05) winner = 'swarm'
  else if (scoreDelta < -0.05) winner = 'baseline'

  return { scoreDelta, costRatio, speedRatio, qualityPerDollar, winner }
}

/**
 * Aggregate benchmark results into a report.
 */
export function aggregateReport(
  results: readonly BenchmarkResult[],
): BenchmarkReport {
  let swarmWins = 0
  let baselineWins = 0
  let ties = 0
  let totalSwarmCost = 0
  let totalBaselineCost = 0

  for (const r of results) {
    if (r.comparison.winner === 'swarm') swarmWins++
    else if (r.comparison.winner === 'baseline') baselineWins++
    else ties++
    totalSwarmCost += r.swarm.costUsd
    totalBaselineCost += r.baseline.costUsd
  }

  return {
    results,
    swarmWins,
    baselineWins,
    ties,
    totalSwarmCost,
    totalBaselineCost,
    timestamp: Date.now(),
  }
}

/**
 * Format math analysis as compact human-readable lines.
 */
export function formatMathAnalysis(math: MathAnalysis): string[] {
  const lines: string[] = ['  -- Math Analysis --']

  // Entropy
  lines.push(
    `  Entropy: ${math.entropy.final.toFixed(3)} (norm: ${math.entropy.normalized.toFixed(3)}, rounds: ${math.entropy.history.length})`,
  )

  // Information gain
  lines.push(
    `  Info gain: total=${math.informationGain.total.toFixed(3)} per-round=${math.informationGain.perRound.toFixed(3)} last=${math.informationGain.lastRound.toFixed(3)}`,
  )

  // Bayesian
  if (math.bayesian.mapEstimate) {
    lines.push(
      `  Bayesian MAP: "${math.bayesian.mapEstimate.proposalId}" p=${math.bayesian.mapEstimate.probability.toFixed(3)} (${math.bayesian.evidenceCount} evidence updates)`,
    )
  }

  // Redundancy
  if (math.redundancy) {
    lines.push(
      `  Redundancy: avg NMI=${math.redundancy.averageNMI.toFixed(3)} redundant=[${math.redundancy.redundantAgents.join(', ')}] unique=${math.redundancy.mostUniqueAgent ?? 'none'}`,
    )
  }

  // Game theory
  if (math.gameTheory) {
    lines.push(
      `  Game theory: expected challengers=${math.gameTheory.expectedChallengers.toFixed(1)} actual=${math.gameTheory.actualChallengers} groupthink=${math.gameTheory.groupthinkRisk}`,
    )
  }

  // Opinion dynamics
  if (math.opinionDynamics) {
    lines.push(
      `  Opinions: ${math.opinionDynamics.clusterCount} clusters, polarization=${math.opinionDynamics.polarizationIndex.toFixed(3)} fragmentation=${math.opinionDynamics.fragmentationRisk}`,
    )
    if (math.opinionDynamics.bridgingAgents.length > 0) {
      lines.push(
        `  Bridging agents: [${math.opinionDynamics.bridgingAgents.join(', ')}]`,
      )
    }
  }

  // Replicator dynamics
  if (math.replicatorDynamics) {
    lines.push(
      `  Replicator: dominant="${math.replicatorDynamics.dominantStrategy}" ESS convergence=${math.replicatorDynamics.convergenceToESS.toFixed(3)}`,
    )
    if (math.replicatorDynamics.suggestedShifts.length > 0) {
      const shifts = math.replicatorDynamics.suggestedShifts
        .map((s) => `${s.strategy}:${s.direction}(${s.magnitude.toFixed(2)})`)
        .join(' ')
      lines.push(`  Strategy shifts: ${shifts}`)
    }
  }

  // Influence
  if (math.influence) {
    lines.push(
      `  Influence: dominant="${math.influence.dominantInfluencer}" Gini=${math.influence.influenceConcentration.toFixed(3)} Fiedler=${math.influence.fiedlerValue.toFixed(3)} fragile=${math.influence.isFragile}`,
    )
    if (math.influence.isolatedAgents.length > 0) {
      lines.push(
        `  Isolated agents: [${math.influence.isolatedAgents.join(', ')}]`,
      )
    }
  }

  // Optimal stopping
  if (math.optimalStopping) {
    lines.push(
      `  Stopping: CUSUM=${math.optimalStopping.cusumStatistic.toFixed(3)} exploration=${math.optimalStopping.explorationComplete ? 'complete' : 'ongoing'} change=${math.optimalStopping.changeDetected}`,
    )
  }

  // Shapley
  if (math.shapley) {
    const values = Object.entries(math.shapley.values)
      .sort((a, b) => b[1] - a[1])
      .map(([agent, val]) => `${agent}=${val.toFixed(3)}`)
      .join(' ')
    lines.push(`  Shapley: ${values}`)
    if (math.shapley.redundantAgents.length > 0) {
      lines.push(
        `  Shapley redundant: [${math.shapley.redundantAgents.join(', ')}]`,
      )
    }
    lines.push(
      `  Top contributors: [${math.shapley.topContributors.join(', ')}]`,
    )
  }

  // Markov
  if (math.markov) {
    lines.push(
      `  Markov: dominant="${math.markov.dominantState}" cycles=${math.markov.cyclesDetected}${math.markov.cycleStates.length > 0 ? ` states=[${math.markov.cycleStates.join(', ')}]` : ''}`,
    )
  }

  // Stopping reason
  if (math.stoppingReason) {
    lines.push(`  Stopping reason: ${math.stoppingReason}`)
  }

  return lines
}

/**
 * Format a benchmark result as a human-readable string.
 */
export function formatResult(result: BenchmarkResult): string {
  const lines = [
    `=== ${result.name} ===`,
    result.description,
    '',
    `  Swarm:    score=${result.swarm.score.toFixed(2)}  tokens=${result.swarm.tokensUsed}  cost=$${result.swarm.costUsd.toFixed(4)}  time=${result.swarm.durationMs}ms  rounds=${result.swarm.roundsUsed ?? '?'}  signals=${result.swarm.signalCount ?? '?'}`,
    `  Baseline: score=${result.baseline.score.toFixed(2)}  tokens=${result.baseline.tokensUsed}  cost=$${result.baseline.costUsd.toFixed(4)}  time=${result.baseline.durationMs}ms`,
    '',
    `  Score delta:  ${result.comparison.scoreDelta > 0 ? '+' : ''}${result.comparison.scoreDelta.toFixed(2)}`,
    `  Cost ratio:   ${result.comparison.costRatio.toFixed(2)}x`,
    `  Quality/$:    ${result.comparison.qualityPerDollar.toFixed(2)}x`,
    `  Winner:       ${result.comparison.winner.toUpperCase()}`,
  ]

  if (result.mathAnalysis) {
    lines.push('')
    lines.push(...formatMathAnalysis(result.mathAnalysis))
  }

  lines.push('')
  return lines.join('\n')
}

/**
 * Format the full report.
 */
export function formatReport(report: BenchmarkReport): string {
  const lines = [
    '+==========================================+',
    '|     cognitive-swarm Benchmark Report     |',
    '+==========================================+',
    '',
    ...report.results.map(formatResult),
    '=== Summary ===',
    `  Swarm wins:    ${report.swarmWins}`,
    `  Baseline wins: ${report.baselineWins}`,
    `  Ties:          ${report.ties}`,
    `  Total swarm cost:    $${report.totalSwarmCost.toFixed(4)}`,
    `  Total baseline cost: $${report.totalBaselineCost.toFixed(4)}`,
    '',
  ]
  return lines.join('\n')
}
