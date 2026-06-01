import { config as loadEnv } from 'dotenv';

loadEnv();

export const config = {
  port: Number(process.env.PORT || 3000),
  azure: {
    openAiEndpoint: process.env.AZURE_OPENAI_ENDPOINT,
    openAiApiKey: process.env.AZURE_OPENAI_API_KEY,
    openAiDeployment: process.env.AZURE_OPENAI_DEPLOYMENT,
    openAiApiVersion: process.env.AZURE_OPENAI_API_VERSION || '2024-10-21',
  },
  sessionPassword: process.env.WEB_APP_PASSWORD,
};

export function requireConfig(value, name) {
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}
