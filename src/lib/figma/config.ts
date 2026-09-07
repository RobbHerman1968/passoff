import "server-only";

export type FigmaConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  encryptionKey: Buffer;
};

export function isFigmaConfigured() {
  return Boolean(
    process.env.FIGMA_CLIENT_ID &&
      process.env.FIGMA_CLIENT_SECRET &&
      process.env.FIGMA_REDIRECT_URI &&
      process.env.FIGMA_TOKEN_ENCRYPTION_KEY,
  );
}

export function getFigmaConfig(): FigmaConfig {
  const clientId = process.env.FIGMA_CLIENT_ID;
  const clientSecret = process.env.FIGMA_CLIENT_SECRET;
  const redirectUri = process.env.FIGMA_REDIRECT_URI;
  const encodedKey = process.env.FIGMA_TOKEN_ENCRYPTION_KEY;

  if (!clientId || !clientSecret || !redirectUri || !encodedKey) {
    throw new Error("Figma OAuth is not configured. Add the FIGMA_* variables from .env.example.");
  }

  const encryptionKey = Buffer.from(encodedKey, "base64");
  if (encryptionKey.length !== 32) {
    throw new Error("FIGMA_TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes.");
  }

  return { clientId, clientSecret, redirectUri, encryptionKey };
}
