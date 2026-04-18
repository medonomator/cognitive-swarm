/**
 * LLM-based automatic outcome evaluator.
 *
 * Uses an LLM to judge whether a swarm's answer is correct,
 * partial, or incorrect given the task and optional criteria.
 */

import type { OutcomeVerdict, OutcomeEvaluator } from '@cognitive-swarm/core'

/** Minimal LLM interface — matches cognitive-engine's LlmProvider. */
export interface EvaluatorLlmProvider {
  complete(messages: readonly { role: string; content: string }[]): Promise<{
    content: string
  }>
}

export class LlmOutcomeEvaluator implements OutcomeEvaluator {
  constructor(private readonly llm: EvaluatorLlmProvider) {}

  async evaluate(
    task: string,
    answer: string,
    criteria?: string,
  ): Promise<{
    readonly verdict: OutcomeVerdict
    readonly details: string
    readonly confidence: number
  }> {
    const criteriaBlock = criteria
      ? `\nEvaluation criteria:\n${criteria}`
      : ''

    const prompt = `You are evaluating the quality of an AI swarm's answer.

Task: ${task}
${criteriaBlock}

Answer to evaluate:
${answer}

Respond in JSON format:
{
  "verdict": "correct" | "partial" | "incorrect",
  "details": "brief explanation of your judgment",
  "confidence": 0.0-1.0
}

Be strict: "correct" means fully addresses the task. "partial" means some value but incomplete or has issues. "incorrect" means fundamentally wrong or unhelpful.`

    const response = await this.llm.complete([
      { role: 'user', content: prompt },
    ])

    return this.parseResponse(response.content)
  }

  private parseResponse(text: string): {
    verdict: OutcomeVerdict
    details: string
    confidence: number
  } {
    // Try to extract JSON from the response
    const jsonMatch = /\{[\s\S]*\}/.exec(text)
    if (!jsonMatch) {
      return { verdict: 'partial', details: 'Could not parse evaluator response', confidence: 0.5 }
    }

    try {
      const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>
      const verdict = parsed['verdict']
      const details = parsed['details']
      const confidence = parsed['confidence']

      if (verdict !== 'correct' && verdict !== 'partial' && verdict !== 'incorrect') {
        return { verdict: 'partial', details: 'Invalid verdict in evaluator response', confidence: 0.5 }
      }

      return {
        verdict,
        details: typeof details === 'string' ? details : 'No details provided',
        confidence: typeof confidence === 'number' ? Math.max(0, Math.min(1, confidence)) : 0.5,
      }
    } catch {
      return { verdict: 'partial', details: 'Failed to parse evaluator JSON', confidence: 0.5 }
    }
  }
}
