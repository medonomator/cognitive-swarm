/**
 * Compute the slope of a linear regression on an array of values.
 *
 * Treats indices as x-values: y = slope * x + intercept.
 * Slope > 0 → increasing trend, < 0 → decreasing.
 *
 * Uses the closed-form least squares formula:
 *   slope = (n·Σxy - Σx·Σy) / (n·Σx² - (Σx)²)
 *
 * @param values - Array of y-values (at least 2)
 * @param windowSize - Use only the last N values (0 = all)
 * @returns Slope, or 0 if insufficient data
 */
export function linearRegressionSlope(
  values: readonly number[],
  windowSize = 0,
): number {
  const data = windowSize > 0 ? values.slice(-windowSize) : values
  const n = data.length
  if (n < 2) return 0

  let sumX = 0
  let sumY = 0
  let sumXY = 0
  let sumX2 = 0

  for (let i = 0; i < n; i++) {
    sumX += i
    sumY += data[i]!
    sumXY += i * data[i]!
    sumX2 += i * i
  }

  const denom = n * sumX2 - sumX * sumX
  if (denom === 0) return 0

  return (n * sumXY - sumX * sumY) / denom
}
