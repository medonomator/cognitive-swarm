# Why Your AI Agents Don't Think

I've spent the past year building AI agents for production systems. Notification timing, code analysis, user behavior prediction. After shipping a dozen of these, I kept hitting the same wall: my agents were goldfish.

Every conversation started from zero. Every mistake was repeated. Every lesson was forgotten the moment the process restarted. I was calling these things "agents" but they were really just prompt templates with a for loop.

So I built something different.

## The goldfish problem

Here's what a typical AI "agent" looks like in 2026:

```typescript
const response = await llm.complete([
  { role: 'system', content: agentPrompt },
  { role: 'user', content: userMessage }
])
```

That's it. That's the agent. Maybe you add RAG for context. Maybe you chain a few calls together. LangChain, CrewAI, AutoGen - they all dress this up differently, but underneath it's the same thing: stateless LLM calls with prompt engineering on top.

The problem isn't the LLM. The problem is everything around it. Real cognition isn't just generating text. It's perceiving context, forming beliefs, remembering what happened last time, and reasoning about what to do next.

## What I mean by "cognitive"

I'm not talking about consciousness or AGI. I'm talking about software patterns that cognitive science figured out decades ago, applied to LLM agents:

**Perception** - not just parsing text, but understanding what changed, what matters, what's new vs. what you already know. When a user says "it broke again," a cognitive agent knows what "again" refers to.

**Memory** - three kinds, just like in cognitive science:
- *Episodic*: what happened (conversations, outcomes, mistakes)
- *Semantic*: what I know (facts, relationships, domain knowledge)
- *Working*: what's relevant right now (filtered from the other two)

**Reasoning** - forming beliefs from evidence. Not "think step by step" - actual belief formation where the agent maintains a world model and updates it as new information arrives.

**Emotions** - before you roll your eyes: I don't mean the agent "feels sad." Emotions in cognitive science are priority signals. High cognitive load? Slow down, ask for clarification. Familiar pattern? Speed up, use cached strategy. It's an efficiency mechanism.

## cognitive-engine: the library

I packaged all of this into [cognitive-engine](https://github.com/medonomator/cognitive-engine) - 14 TypeScript packages, each handling one cognitive module. It's provider-agnostic: plug in any LLM, any storage backend.

```bash
npm install cognitive-engine
```

The core idea: instead of one LLM call per interaction, the agent runs a cognitive pipeline:

```
Input -> Perception -> Working Memory -> Reasoning -> Response
              |              ^
              v              |
         Episodic        Semantic
         Memory          Memory
```

Perception analyzes the input, extracts entities and intent, checks it against existing beliefs. Working memory pulls in relevant context from both memory types. Reasoning generates intentions and picks a strategy. The LLM is just one component in this pipeline, not the whole thing.

Here's what a basic setup looks like:

```typescript
import { CognitiveOrchestrator, OpenAiLlmProvider, MemoryStore } from 'cognitive-engine'

const engine = {
  llm: new OpenAiLlmProvider({ model: 'gpt-4o-mini' }),
  embedding: new OpenAiEmbeddingProvider(),
  store: new MemoryStore()
}

const agent = new CognitiveOrchestrator({
  engine,
  modules: {
    perception: true,
    episodicMemory: true,
    semanticMemory: true,
    reasoning: true,
    metacognition: true
  }
})

const response = await agent.process('Review this pull request for security issues')
```

Looks similar to a regular LLM call, but underneath, the agent is:
1. Perceiving the request (code review, security focus)
2. Checking episodic memory for past reviews (what did I miss last time?)
3. Loading relevant facts from semantic memory (common vulnerability patterns)
4. Reasoning about strategy (should I focus on auth? input validation? both?)
5. Metacognition - checking if the strategy makes sense given the context

## The part where it actually learns

The real payoff comes after multiple interactions. Say you have a code review agent. First run, it catches SQL injection and missing auth checks. Standard stuff.

Then a human reviewer replies: "You missed the path traversal in the file upload handler. That's the third time this pattern slipped through."

With a normal LLM wrapper, this feedback vanishes. Next time, same blind spot.

With cognitive-engine, the agent stores this as an episodic memory: "Missed path traversal in file upload - recurring blind spot." Next time it sees file handling code, working memory surfaces this episode. The agent pays extra attention to path construction. It learned.

This isn't fine-tuning. It's not RAG (though you can combine them). It's the agent maintaining its own experience log and consulting it before acting. The memory persists across sessions, across restarts, across deployments if you use a persistent store like Qdrant instead of the in-memory default.

After a few weeks of operation, the agent has built up a personalized knowledge base of what it tends to miss, what patterns are common in your codebase, and what the human reviewers care about. It gets better at its job the same way a junior developer does - through accumulated experience, not through retraining.

## How it compares

I want to be fair here. LangChain, CrewAI, and AutoGen are good tools that solve real problems.

LangChain is excellent for building complex chains and has a massive ecosystem. If you need tool integration and retrieval, it's battle-tested.

CrewAI makes multi-agent coordination dead simple. Role-based crews are intuitive and the API is clean.

AutoGen's conversational agents are great for human-in-the-loop workflows.

cognitive-engine does something different: it gives individual agents actual cognitive capabilities. Memory that persists and improves over time. Beliefs that update on evidence. Metacognition that catches the agent's own biases.

| | LangChain | CrewAI | AutoGen | cognitive-engine |
|---|---|---|---|---|
| Memory | RAG (external) | None built-in | Chat history | Episodic + Semantic + Working |
| Learning | Manual fine-tune | None | None | Automatic from experience |
| Self-awareness | None | None | None | Metacognition module |
| Provider lock-in | Partial | OpenAI-heavy | OpenAI-heavy | Fully agnostic |

## What's next

cognitive-engine is the foundation - it makes individual agents smarter. But the real question is: what happens when multiple cognitive agents work together?

Not a pipeline where agent A passes to agent B. Not a chat loop. A swarm where agents emit signals, form beliefs, disagree, debate, and reach mathematically verified consensus.

That's [cognitive-swarm](https://github.com/medonomator/cognitive-swarm), and I'll write about it next week.

---

Both libraries are open source under Apache 2.0. Built in TypeScript with strict mode, zero dependencies on specific LLM providers.

- cognitive-engine: [github.com/medonomator/cognitive-engine](https://github.com/medonomator/cognitive-engine) | `npm install cognitive-engine`
- cognitive-swarm: [github.com/medonomator/cognitive-swarm](https://github.com/medonomator/cognitive-swarm)

If you try it out and something's broken or confusing, open an issue. I read all of them.
