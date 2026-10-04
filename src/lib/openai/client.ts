import "server-only";

import OpenAI from "openai";

import { getOpenAIApiKey, OpenAIConfigurationError } from "@/lib/openai/config";

let client: OpenAI | null = null;

export function getOpenAIClient(): OpenAI {
  if (client) return client;

  try {
    client = new OpenAI({
      apiKey: getOpenAIApiKey(),
      timeout: 20_000,
      maxRetries: 0,
    });
  } catch (error) {
    if (error instanceof OpenAIConfigurationError) throw error;
    throw new OpenAIConfigurationError();
  }

  return client;
}

/** Test helper — clears the memoized client. */
export function resetOpenAIClientForTests() {
  client = null;
}

export { OpenAIConfigurationError };
