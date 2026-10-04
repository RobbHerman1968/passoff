import "server-only";

export class OpenAIConfigurationError extends Error {
  constructor(message = "OpenAI is not configured.") {
    super(message);
    this.name = "OpenAIConfigurationError";
  }
}

export function getOpenAIApiKey(): string {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) {
    throw new OpenAIConfigurationError("OPENAI_API_KEY is not configured.");
  }
  return key;
}

/**
 * Model id from OPENAI_MODEL only. Callers must not hardcode a model name.
 */
export function getOpenAIModel(): string {
  const model = process.env.OPENAI_MODEL?.trim();
  if (!model) {
    throw new OpenAIConfigurationError("OPENAI_MODEL is not configured.");
  }
  return model;
}

export function isOpenAIConfigured(): boolean {
  return Boolean(
    process.env.OPENAI_API_KEY?.trim() && process.env.OPENAI_MODEL?.trim(),
  );
}
