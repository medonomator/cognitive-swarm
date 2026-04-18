import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'cognitive-swarm',
  description: 'Signal-based swarm intelligence for LLM agents. Not a pipeline. Not a chat loop.',
  base: '/cognitive-swarm/',
  themeConfig: {
    nav: [
      { text: 'Guide', link: '/guide/getting-started' },
      { text: 'Packages', link: '/packages/core' },
      { text: 'GitHub', link: 'https://github.com/medonomator/cognitive-swarm' }
    ],
    sidebar: {
      '/guide/': [
        {
          text: 'Introduction',
          items: [
            { text: 'What is cognitive-swarm?', link: '/guide/what-is-cognitive-swarm' },
            { text: 'Getting Started', link: '/guide/getting-started' },
            { text: 'Architecture', link: '/guide/architecture' },
          ]
        },
        {
          text: 'Core Concepts',
          items: [
            { text: 'Signals', link: '/guide/signals' },
            { text: 'Consensus', link: '/guide/consensus' },
            { text: 'Resilience', link: '/guide/resilience' },
            { text: 'Math Modules', link: '/guide/math-modules' },
            { text: 'Observability', link: '/guide/observability' },
            { text: 'Evolution', link: '/guide/evolution' },
          ]
        }
      ],
      '/packages/': [
        {
          text: 'Core',
          items: [
            { text: '@cognitive-swarm/core', link: '/packages/core' },
            { text: '@cognitive-swarm/orchestrator', link: '/packages/orchestrator' },
            { text: '@cognitive-swarm/agent', link: '/packages/agent' },
            { text: '@cognitive-swarm/signals', link: '/packages/signals' },
            { text: '@cognitive-swarm/consensus', link: '/packages/consensus' },
            { text: '@cognitive-swarm/math', link: '/packages/math' },
          ]
        },
        {
          text: 'Composition & Evolution',
          items: [
            { text: '@cognitive-swarm/composer', link: '/packages/composer' },
            { text: '@cognitive-swarm/evolution', link: '/packages/evolution' },
            { text: '@cognitive-swarm/evaluation', link: '/packages/evaluation' },
            { text: '@cognitive-swarm/reputation', link: '/packages/reputation' },
            { text: '@cognitive-swarm/introspection', link: '/packages/introspection' },
            { text: '@cognitive-swarm/templates', link: '/packages/templates' },
          ]
        },
        {
          text: 'Memory',
          items: [
            { text: '@cognitive-swarm/memory-pool', link: '/packages/memory-pool' },
            { text: '@cognitive-swarm/memory-qdrant', link: '/packages/memory-qdrant' },
          ]
        },
        {
          text: 'Integrations',
          items: [
            { text: '@cognitive-swarm/otel', link: '/packages/otel' },
            { text: '@cognitive-swarm/mcp', link: '/packages/mcp' },
            { text: '@cognitive-swarm/a2a', link: '/packages/a2a' },
            { text: '@cognitive-swarm/tools-web-fetch', link: '/packages/tools-web-fetch' },
            { text: '@cognitive-swarm/tools-web-search', link: '/packages/tools-web-search' },
          ]
        },
        {
          text: 'Testing',
          items: [
            { text: '@cognitive-swarm/benchmarks', link: '/packages/benchmarks' },
          ]
        }
      ]
    },
    socialLinks: [
      { icon: 'github', link: 'https://github.com/medonomator/cognitive-swarm' }
    ],
    search: {
      provider: 'local'
    },
    footer: {
      message: 'Released under the Apache 2.0 License.',
      copyright: 'Copyright 2026 Dmitry Zorin'
    }
  }
})
