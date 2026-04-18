# @cognitive-swarm/signals

Signal bus -- the nervous system of the cognitive swarm.

## Install

```bash
npm install @cognitive-swarm/signals
```

## Overview

This package provides the communication backbone for the swarm. Agents exchange typed signals (task, discovery, proposal, doubt, challenge, vote, conflict, consensus, escalate) through the `SignalBus`. The `ConflictDetector` monitors the bus and flags contradictory signals automatically.

## Usage

```typescript
import { SignalBus, ConflictDetector } from '@cognitive-swarm/signals'
import type { ResolvedSignalBusConfig } from '@cognitive-swarm/core'

// Create the bus
const bus = new SignalBus(config)

// Emit a signal
bus.emit({
  type: 'discovery',
  source: 'agent-analyst',
  payload: { content: 'Found correlation in dataset' },
})

// Subscribe to signals
bus.on('proposal', (signal) => {
  console.log(signal.source, signal.payload)
})

// Detect contradictions
const detector = new ConflictDetector(bus)
// Conflict signals are emitted back onto the bus automatically
```

## API

### SignalBus

- `emit(signal)` -- broadcast a typed signal to the swarm
- `on(type, handler)` -- subscribe to a specific signal type
- `getHistory()` -- retrieve the full signal log

### ConflictDetector

- Attaches to a `SignalBus` and watches for contradictory discovery/proposal signals
- Emits `conflict` signals when contradictions are detected

## License

Apache-2.0

## Links

- [cognitive-swarm root](https://github.com/medonomator/cognitive-swarm)
