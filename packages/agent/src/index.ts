/**
 * @kesef/agent — grounded AI agent, RAG, tools, MCP (Wave 4).
 *
 * Router → {SQL | RAG | Tools} → Composer → Number Validator. Every answer
 * passes validateAnswer(), which throws on any number not grounded in the
 * retrieved context (anti-hallucination enforced in code, not the prompt).
 */
export const AGENT_PLACEHOLDER = true;
