# Plan: Medium-статьи для cognitive-swarm + cognitive-engine

## Аудитория

Senior-разработчики и AI-инженеры, которые уже пробовали LangChain/CrewAI/AutoGen и уперлись в ограничения: нет настоящей памяти, нет разногласий между агентами, нет математики за консенсусом.

## Где публиковать

- Medium: целиться в "Towards Data Science" или "Better Programming" (больше охват)
- Кросс-пост: dev.to, Hashnode
- HackerNews: "Show HN" формат
- Reddit: r/MachineLearning, r/LocalLLaMA, r/programming
- Twitter/X: тред с ключевыми тезисами + ссылка

## Статья 1: "Why Your AI Agents Don't Think" (cognitive-engine)

Цель: познакомить с cognitive-engine как фундаментом.

Структура:
- Открытие: "AI agent" в 2024-2026 = LLM + цикл + промпт. Агенты забывают все между вызовами. Не учатся на ошибках. Это не когнитивность.
- Что такое когнитивность в софте: perception, episodic/semantic/working memory, reasoning, emotions как сигналы приоритета
- Архитектура: 14 пакетов, provider-agnostic, пример кода с perception + memory
- Живой пример: code review агент, который учится. Первый запуск - базовые баги. После фидбека - сохраняет в episodic memory. Второй запуск - применяет прошлый опыт. ~30 строк кода.
- Сравнение: таблица vs LangChain vs CrewAI vs AutoGen. Без хейта - уважение к конкурентам.
- Закрытие: ссылка на GitHub, тизер статьи 2

~1700 слов, 8-10 мин чтения.

## Статья 2: "Multi-Agent AI That Actually Disagrees" (cognitive-swarm)

Цель: показать что мульти-агент != несколько промптов.

Структура:
- Открытие: CrewAI агенты выполняют скрипт по очереди. AutoGen - бесконечный чат. Где настоящее взаимодействие?
- Signal-based архитектура: агенты не видят промпты друг друга, общаются через типизированные сигналы. Signal Bus как нервная система.
- Математика консенсуса: Shannon entropy (когда остановиться), Bayesian updating (как обновлять убеждения), game theory (почему devil's advocate выгоден математически). Доступно, не академично.
- Debate mechanism: proposal -> critique -> counter-argument -> resolution. Бенчмарк: single GPT-4 vs 5-agent swarm на архитектурной задаче. Swarm покрывает 6/6 доменов, single model 3-4/6.
- Живой пример: 5 агентов анализируют "microservices vs monolith". Streaming output, раунды, confidence. ~40 строк кода.
- Production features: OpenTelemetry, A2A protocol, evolution, Qdrant memory
- Закрытие: обе либы open source, Apache 2.0

~2000 слов, 10-12 мин чтения.

## Статья 3 (опционально, для HackerNews): "The Math of Multi-Agent Consensus"

Technical deep-dive:
- Shannon entropy в дискретных opinion spaces
- Replicator dynamics для эволюции убеждений
- Shapley values для оценки вклада агентов
- Optimal stopping theory - когда прекратить обсуждение
- Markov chains - предсказание сходимости
- Все с кодом из cognitive-swarm/math

## Принципы

1. Начинать с проблемы, не с решения
2. Код должен запускаться copy-paste
3. Бенчмарки вместо прилагательных
4. Не гнобить конкурентов
5. CTA в конце: star repo, try example

## Таймлайн

1. Статья 1 первой (cognitive-engine уже на npm)
2. Статья 2 через неделю (после public release cognitive-swarm)
3. Статья 3 - опционально, для HN

## Картинки (нарисовать)

- Диаграмма: когнитивные модули cognitive-engine
- Signal flow: 4 агента, 3 раунда, сигналы между ними
- График: entropy decreasing over rounds
- Benchmark chart: single model vs swarm

## SEO

Tags: AI Agents, LLM, Multi-Agent Systems, TypeScript, Open Source
Не использовать: "revolutionary", "game-changing", "AGI" - убивает credibility
