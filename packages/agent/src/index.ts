/**
 * @kesef/agent — grounded AI agent (Wave 4).
 * Router → {SQL | RAG | Tools} → Composer → Number Validator.
 * The anti-hallucination guard (validateAnswer) and refusal list are enforced
 * in code, not the prompt.
 */
export * from './validate-answer';
export * from './mcp';
