# Code Review Swarm Example

5 specialized agents analyze code for security vulnerabilities, performance issues, architecture problems, and edge cases, then reach consensus on findings.

## Agents

| Agent | Role |
|-------|------|
| Security Analyst | OWASP Top 10, injection, auth issues |
| Performance Reviewer | Bottlenecks, memory leaks, N+1 queries |
| Architecture Critic | SOLID violations, coupling, maintainability |
| Edge-Case Hunter | Boundary conditions, error paths, race conditions |
| Review Synthesizer | Consolidates findings into prioritized review |

## Run

```bash
# From repo root
OPENAI_API_KEY=sk-... npx tsx examples/code-review/index.ts
```

The example analyzes a deliberately buggy login/upload handler with SQL injection, hardcoded secrets, missing auth, and path traversal vulnerabilities. The swarm should find all of them.

## Expected Output

```
Code Review Swarm
=================
5 agents: security, performance, architecture, edge-cases, synthesizer
Analyzing code...

--- Round 1 ---
  [security] analyze (1200ms)
  [performance] analyze (980ms)
  [architecture] analyze (1100ms)
  ...
  Consensus: not yet (confidence: 45%)

--- Round 2 ---
  ...
  Consensus: REACHED (confidence: 82%)

============================================================
REVIEW RESULT
============================================================
1. [CRITICAL] SQL Injection - username and password interpolated directly...
2. [CRITICAL] Hardcoded JWT secret - 'secret123'...
...
```

## Cost

Approximately $0.01-0.03 per run using GPT-4o-mini.
