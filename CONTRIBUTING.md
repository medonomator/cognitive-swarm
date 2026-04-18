# Contributing to cognitive-swarm

Thank you for your interest in contributing! This guide will help you get started.

## Development Setup

```bash
# Clone the repository
git clone https://github.com/medonomator/cognitive-swarm.git
cd cognitive-swarm

# Install dependencies (requires Node.js >= 20)
npm install

# Build all packages
npm run build

# Run all tests
npm run test

# Lint
npm run lint
```

## Project Structure

This is a monorepo using npm workspaces and Turborepo:

```
packages/
  core/           # Types, Signal Bus, base interfaces
  signals/        # Signal validation & filtering
  consensus/      # Consensus engines (confidence-weighted, supermajority, unanimous)
  agent/          # LLM-powered swarm agents with Thompson Bandit strategy selection
  orchestrator/   # SwarmOrchestrator — rounds, synthesis, coordination
  math/           # Information-theoretic analysis (entropy, KL divergence)
  memory-pool/    # In-memory vector store
  memory-qdrant/  # Qdrant-backed persistent memory
  reputation/     # Agent reputation tracking
  introspection/  # Self-monitoring and deadlock detection
  composer/       # Declarative swarm configuration builder
  templates/      # Pre-built agent archetypes
  evolution/      # Evolutionary swarm optimization
  mcp/            # Model Context Protocol tool integration
  otel/           # OpenTelemetry instrumentation
  a2a/            # A2A (Agent-to-Agent) protocol support
```

## Making Changes

1. Create a feature branch from `main`
2. Make your changes in the relevant package(s)
3. Add or update tests — all packages use [Vitest](https://vitest.dev/)
4. Ensure `npm run build` and `npm run test` pass
5. Submit a pull request

## Code Style

- TypeScript strict mode — no `any` casts
- Follow existing patterns (GRASP/SOLID principles)
- No TODO/FIXME/HACK comments — fix it or file an issue
- Tests live in `__tests__/` directories or alongside source as `*.test.ts`

## Reporting Issues

- Use [GitHub Issues](https://github.com/medonomator/cognitive-swarm/issues)
- Include reproduction steps, expected vs actual behavior
- For bugs: include Node.js version and relevant package versions

## License

By contributing, you agree that your contributions will be licensed under the Apache License 2.0.
