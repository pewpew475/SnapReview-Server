import { nvidiaClient, AI_CONFIG, getNvidiaClient } from './nvidia-client';
import { constructEvaluationPrompt, SYSTEM_PROMPT } from './prompts';

interface EvaluationResult {
  overall_score: number;
  scores: {
    readability: number;
    efficiency: number;
    maintainability: number;
    security: number;
  };
  summary: string;
  strengths: Array<{ title: string; description: string; code_snippet: string }>;
  improvements: Array<{
    title: string;
    description: string;
    priority: 'high' | 'medium' | 'low';
    line_numbers: number[];
    suggestion: string;
    refactored_example: string;
  }>;
  refactored_code: string;
  best_practices: string[];
  resources: Array<{ title: string; url: string }>;
}

export async function evaluateCodeStreaming(
  taskData: any,
  onChunk: (chunk: string) => void
): Promise<string> {
  // Check API key before making request
  if (!process.env.NVIDIA_API_KEY || process.env.NVIDIA_API_KEY === 'placeholder-key-missing') {
    throw new Error('NVIDIA API key is not configured. Please set NVIDIA_API_KEY in your environment variables.');
  }

  const prompt = constructEvaluationPrompt(taskData);

  // Get a fresh client to ensure we're using the latest API key from environment
  let client;
  try {
    client = getNvidiaClient();
  } catch (clientError: any) {
    // Fall back to the default client if getNvidiaClient fails
    client = nvidiaClient;
    console.warn('[EVALUATOR] Using default client, getNvidiaClient failed:', clientError.message);
  }

  try {
    const completion = await client.chat.completions.create({
      model: AI_CONFIG.model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
      temperature: AI_CONFIG.temperature,
      top_p: AI_CONFIG.top_p,
      max_tokens: AI_CONFIG.max_tokens,
      stream: true,
    });

    let fullResponse = '';

    for await (const chunk of completion) {
      const content = chunk.choices?.[0]?.delta?.content;
      if (content) {
        fullResponse += content;
        onChunk(content);
      }
    }

    return fullResponse;
  } catch (error: any) {
    // Provide better error messages for NVIDIA API errors
    if (error.status === 401) {
      throw new Error('NVIDIA API authentication failed. Please verify your NVIDIA_API_KEY is valid and not expired. Check your .env.local file.');
    } else if (error.status === 403) {
      throw new Error('NVIDIA API access forbidden. Your API key may not have permission to access this model.');
    } else if (error.status === 429) {
      throw new Error('NVIDIA API rate limit exceeded. Please try again later.');
    } else if (error.message) {
      throw new Error(`NVIDIA API error: ${error.message}`);
    } else {
      throw new Error(`NVIDIA API request failed with status ${error.status || 'unknown'}`);
    }
  }
}

export async function evaluateCodeComplete(taskData: any): Promise<EvaluationResult> {
  // Check API key before making request
  if (!process.env.NVIDIA_API_KEY || process.env.NVIDIA_API_KEY === 'placeholder-key-missing') {
    throw new Error('NVIDIA API key is not configured. Please set NVIDIA_API_KEY in your environment variables.');
  }

  const prompt = constructEvaluationPrompt(taskData);

  // Get a fresh client to ensure we're using the latest API key from environment
  let client;
  try {
    client = getNvidiaClient();
    // Debug: Log API key info (first/last chars only for security)
    const apiKey = process.env.NVIDIA_API_KEY || '';
    if (apiKey) {
      console.log(`[EVALUATOR] Using API key: ${apiKey.substring(0, 10)}...${apiKey.substring(apiKey.length - 4)} (${apiKey.length} chars)`);
    }
  } catch (clientError: any) {
    // Fall back to the default client if getNvidiaClient fails
    client = nvidiaClient;
    console.warn('[EVALUATOR] Using default client, getNvidiaClient failed:', clientError.message);
  }

  try {
    console.log(`[EVALUATOR] Making API call to model: ${AI_CONFIG.model}`);
    const completion = await client.chat.completions.create({
      model: AI_CONFIG.model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
      temperature: AI_CONFIG.temperature,
      top_p: AI_CONFIG.top_p,
      max_tokens: AI_CONFIG.max_tokens,
      stream: false,
    });

    // When stream=false, the OpenAI client returns the full response in choices[0].message.content
    const raw = completion.choices?.[0]?.message?.content || '';

    return parseAIResponse(raw);
  } catch (error: any) {
    // Log detailed error information for debugging
    console.error('[EVALUATOR] API call failed:', {
      status: error.status,
      message: error.message,
      code: error.code,
      type: error.type,
      model: AI_CONFIG.model,
      apiKeyLength: process.env.NVIDIA_API_KEY?.length || 0,
      apiKeyPrefix: process.env.NVIDIA_API_KEY?.substring(0, 10) || 'missing',
    });

    // Provide better error messages for NVIDIA API errors
    if (error.status === 401) {
      const apiKey = process.env.NVIDIA_API_KEY || '';
      throw new Error(`NVIDIA API authentication failed (401). Please verify your NVIDIA_API_KEY is correct. Current key: ${apiKey ? `${apiKey.substring(0, 10)}...${apiKey.substring(apiKey.length - 4)} (${apiKey.length} chars)` : 'NOT SET'}. Check your .env.local file and ensure the key matches the one that works in Python.`);
    } else if (error.status === 403) {
      throw new Error('NVIDIA API access forbidden (403). Your API key may not have permission to access this model. Verify your API key has access to the model: ' + AI_CONFIG.model);
    } else if (error.status === 429) {
      throw new Error('NVIDIA API rate limit exceeded (429). Please try again later.');
    } else if (error.message) {
      throw new Error(`NVIDIA API error: ${error.message}`);
    } else {
      throw new Error(`NVIDIA API request failed with status ${error.status || 'unknown'}`);
    }
  }
}

export function parseAIResponse(response: string): EvaluationResult {
  try {
    let cleaned = response.trim();

    // Remove triple-backtick code fences if present
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n```$/, '');
    }

    // Sometimes the model may include markdown or surrounding text — try to extract the first JSON object
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1) {
      cleaned = cleaned.slice(firstBrace, lastBrace + 1);
    }

    // Try to fix common JSON issues
    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (parseError: any) {
      // If parsing fails, try to fix common issues
      console.warn('Initial JSON parse failed, attempting to fix:', parseError.message);
      
      // Try to extract the JSON object more carefully
      // Find the first { and try to find a matching }
      let startIdx = cleaned.indexOf('{');
      if (startIdx === -1) {
        throw parseError;
      }
      
      // Try to find the last complete } by counting braces and handling strings properly
      let braceCount = 0;
      let inString = false;
      let escapeNext = false;
      let endIdx = -1;
      let lastValidEndIdx = -1;
      
      for (let i = startIdx; i < cleaned.length; i++) {
        const char = cleaned[i];
        
        if (escapeNext) {
          escapeNext = false;
          continue;
        }
        
        if (char === '\\') {
          escapeNext = true;
          continue;
        }
        
        if (char === '"' && !escapeNext) {
          inString = !inString;
          continue;
        }
        
        if (!inString) {
          if (char === '{') {
            braceCount++;
          } else if (char === '}') {
            braceCount--;
            lastValidEndIdx = i;
            if (braceCount === 0) {
              endIdx = i;
              break;
            }
          }
        }
      }
      
      // Use the last valid end index if we didn't find a complete match
      if (endIdx === -1 && lastValidEndIdx !== -1 && braceCount > 0) {
        // We have an unterminated JSON, try to close it
        endIdx = lastValidEndIdx;
        // Try to fix by closing any open strings and braces
        let fixedJson = cleaned.substring(startIdx, endIdx + 1);
        
        // Try to close any unterminated strings
        let stringCount = (fixedJson.match(/"/g) || []).length;
        if (stringCount % 2 !== 0) {
          // Unclosed string, try to find where it should end and close it
          const lastQuoteIdx = fixedJson.lastIndexOf('"');
          if (lastQuoteIdx !== -1) {
            // Check if we're in a string context
            const beforeLastQuote = fixedJson.substring(0, lastQuoteIdx);
            const quoteCountBefore = (beforeLastQuote.match(/"/g) || []).length;
            if (quoteCountBefore % 2 === 1) {
              // We're in a string, try to close it before the last brace
              const beforeBrace = fixedJson.substring(0, fixedJson.lastIndexOf('}'));
              fixedJson = beforeBrace + '"' + '}';
            }
          }
        }
        
        // Close any remaining open braces
        while (braceCount > 0) {
          fixedJson += '}';
          braceCount--;
        }
        
        cleaned = fixedJson;
      } else if (endIdx !== -1) {
        cleaned = cleaned.substring(startIdx, endIdx + 1);
      } else {
        throw parseError;
      }
      
      // Try parsing the fixed JSON
      try {
        parsed = JSON.parse(cleaned);
      } catch (secondError) {
        console.error('JSON parsing failed after fixes:', secondError);
        console.error('Cleaned JSON length:', cleaned.length);
        console.error('First 500 chars:', cleaned.substring(0, 500));
        console.error('Last 500 chars:', cleaned.substring(Math.max(0, cleaned.length - 500)));
        throw parseError; // Throw original error
      }
    }

    if (typeof parsed !== 'object' || parsed === null) {
      throw new Error('Parsed result is not an object');
    }

    // Normalize structure
    parsed.strengths = parsed.strengths || [];
    parsed.improvements = parsed.improvements || [];
    parsed.best_practices = parsed.best_practices || [];
    parsed.resources = parsed.resources || [];

    // Validate required fields
    if (typeof parsed.overall_score !== 'number' || !parsed.scores || !parsed.summary) {
      throw new Error('Invalid response structure');
    }

    return parsed as EvaluationResult;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to parse AI response:', error);
    // eslint-disable-next-line no-console
    console.error('Raw response:', response);

    // Fallback
    return {
      overall_score: 50,
      scores: { readability: 5, efficiency: 5, maintainability: 5, security: 5 },
      summary: 'Unable to complete automated evaluation. Please try again.',
      strengths: [],
      improvements: [],
      refactored_code: '',
      best_practices: [],
      resources: [],
    } as EvaluationResult;
  }
}

export default { evaluateCodeStreaming, evaluateCodeComplete, parseAIResponse };
