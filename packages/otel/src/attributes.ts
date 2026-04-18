// Span attribute keys - semantic conventions for cognitive-swarm

export const ATTR = {
  // Solve-level
  TASK: 'swarm.task',
  AGENT_COUNT: 'swarm.agent_count',
  MAX_ROUNDS: 'swarm.max_rounds',
  ROUNDS_USED: 'swarm.rounds_used',
  TOTAL_SIGNALS: 'swarm.total_signals',
  CONSENSUS_REACHED: 'swarm.consensus_reached',
  CONFIDENCE: 'swarm.confidence',
  TOKENS: 'swarm.tokens',
  COST_USD: 'swarm.cost_usd',

  // Round-level
  ROUND_NUMBER: 'swarm.round.number',
  ROUND_SIGNAL_COUNT: 'swarm.round.signal_count',

  // Agent-level
  AGENT_ID: 'swarm.agent.id',
  AGENT_NAME: 'swarm.agent.name',
  AGENT_STRATEGY: 'swarm.agent.strategy',
  PROCESSING_TIME_MS: 'swarm.agent.processing_time_ms',

  // Signal-level
  SIGNAL_TYPE: 'swarm.signal.type',
  SIGNAL_ID: 'swarm.signal.id',

  // Tool-level
  TOOL_NAME: 'swarm.tool.name',
  TOOL_IS_ERROR: 'swarm.tool.is_error',
  TOOL_DURATION_MS: 'swarm.tool.duration_ms',

  // Debate-level
  DEBATE_RESOLVED: 'swarm.debate.resolved',
  DEBATE_ROUNDS: 'swarm.debate.rounds',

  // Advisor-level
  ADVISOR_ACTION: 'swarm.advisor.action_type',

  // Topology-level
  TOPOLOGY_REASON: 'swarm.topology.reason',
  TOPOLOGY_NEIGHBOR_COUNT: 'swarm.topology.neighbor_count',
} as const
