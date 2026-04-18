import type { Signal, ConsensusResult } from '@cognitive-swarm/core'
import type { LlmProvider } from '@cognitive-engine/core'

const DEFAULT_SYNTHESIS_PROMPT = `You are a synthesis agent. Given the following task, consensus result, agent discoveries, and proposals, produce a clear, comprehensive answer.

Focus on:
- The winning proposal and its reasoning
- Key supporting discoveries
- Important dissenting views or caveats
- Actionable conclusions

Be concise but thorough. Do not repeat information unnecessarily.`

/**
 * Synthesizes a final answer from swarm consensus and discoveries.
 * Uses a (potentially smarter) LLM to produce polished output.
 */
export class Synthesizer {
  private readonly llm: LlmProvider
  private readonly systemPrompt: string

  constructor(llm: LlmProvider, prompt?: string) {
    this.llm = llm
    this.systemPrompt = prompt ?? DEFAULT_SYNTHESIS_PROMPT
  }

  async synthesize(
    task: string,
    consensus: ConsensusResult,
    discoveries: readonly Signal[],
    proposals: readonly Signal[],
  ): Promise<string> {
    const discoveryLines = discoveries
      .slice(0, 20)
      .map((s, i) => {
        const payload = s.payload
        const finding =
          'finding' in payload ? payload.finding : JSON.stringify(payload)
        return `${i + 1}. [${s.source}] ${finding}`
      })
      .join('\n')

    const proposalLines = proposals
      .slice(0, 10)
      .map((s, i) => {
        const payload = s.payload
        const content =
          'content' in payload ? payload.content : JSON.stringify(payload)
        return `${i + 1}. [${s.source}] ${content}`
      })
      .join('\n')

    const userMessage = `Task: ${task}

Winning decision: ${consensus.decision ?? 'No decision reached'}
Confidence: ${(consensus.confidence * 100).toFixed(0)}%

${consensus.dissent.length > 0 ? `Dissenting views:\n${consensus.dissent.map((d, i) => `${i + 1}. ${d}`).join('\n')}` : ''}

Key discoveries:
${discoveryLines || 'None'}

Proposals considered:
${proposalLines || 'None'}

Provide a synthesized answer to the original task.`

    const response = await this.llm.complete([
      { role: 'system', content: this.systemPrompt },
      { role: 'user', content: userMessage },
    ])

    return response.content
  }
}
