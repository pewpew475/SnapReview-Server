import OpenAI from 'openai';

const baseUrl = process.env.NVIDIA_BASE_URL || 'https://integrate.api.nvidia.com/v1';
const apiKey = process.env.NVIDIA_API_KEY;

if (!apiKey) {
  // Do not throw on import to allow tests without keys, but warn
  // Consumers should ensure env is set in production.
  // eslint-disable-next-line no-console
  console.warn('NVIDIA_API_KEY is not set. AI calls will fail without a valid key.');
} else if (apiKey.length < 20) {
  // Basic validation - NVIDIA API keys are typically longer
  console.warn('NVIDIA_API_KEY appears to be invalid (too short). Please check your environment variables.');
} else {
  // Log that we have a valid-looking key (first few chars only for security)
  console.log(`[NVIDIA] API key loaded: ${apiKey.substring(0, 10)}...${apiKey.substring(apiKey.length - 4)} (${apiKey.length} chars)`);
}

// Use a placeholder key if missing to prevent constructor error
// API calls will still fail with a clear error message
export const nvidiaClient = new OpenAI({
  apiKey: apiKey || 'placeholder-key-missing',
  baseURL: baseUrl,
});

// Function to get a fresh client with current env vars (in case they changed)
export function getNvidiaClient(): OpenAI {
  const currentApiKey = process.env.NVIDIA_API_KEY;
  const currentBaseUrl = process.env.NVIDIA_BASE_URL || 'https://integrate.api.nvidia.com/v1';
  
  if (!currentApiKey || currentApiKey === 'placeholder-key-missing') {
    throw new Error('NVIDIA_API_KEY is not configured');
  }
  
  return new OpenAI({
    apiKey: currentApiKey,
    baseURL: currentBaseUrl,
  });
}

// Export function to check if API key is valid
export function isNvidiaApiKeyConfigured(): boolean {
  return !!process.env.NVIDIA_API_KEY && 
         process.env.NVIDIA_API_KEY !== 'placeholder-key-missing' &&
         process.env.NVIDIA_API_KEY.length > 20;
}

export const AI_CONFIG = {
  model: process.env.NVIDIA_MODEL || 'moonshotai/kimi-k2-instruct-0905',
  temperature: parseFloat(process.env.AI_TEMPERATURE || '0.6'),
  top_p: parseFloat(process.env.AI_TOP_P || '0.9'),
  max_tokens: parseInt(process.env.AI_MAX_TOKENS || '15000', 10), // Increased for more detailed reports
  stream: true,
};

export default nvidiaClient;
