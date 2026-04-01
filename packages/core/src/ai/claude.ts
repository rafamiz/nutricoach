import { buildSystemPrompt } from './prompts';
import { parseAIResponse } from './parser';
import { UserContext } from '../types/user';
import { AIResponse } from '../types/ai-response';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export async function analyzeMessage(
  userMessage: string,
  userContext: UserContext,
  conversationHistory: ChatMessage[] = [],
  imageBase64?: string,
  imageMimeType?: string,
): Promise<AIResponse> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set');

  // Build messages array from history
  const messages: Array<{ role: string; content: unknown }> = conversationHistory.map((msg) => ({
    role: msg.role,
    content: msg.content,
  }));

  // Build current user message content
  const userContent: Array<Record<string, unknown>> = [];

  if (imageBase64 && imageMimeType) {
    userContent.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: imageMimeType,
        data: imageBase64,
      },
    });
    userContent.push({
      type: 'text',
      text: userMessage || 'Analizá esta comida',
    });
  } else {
    userContent.push({
      type: 'text',
      text: userMessage,
    });
  }

  messages.push({ role: 'user', content: userContent });

  // Direct fetch to Anthropic API (avoids SDK connection issues on Vercel)
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      temperature: 0.3,
      system: buildSystemPrompt(userContext),
      messages,
    }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Anthropic API error ${res.status}: ${errBody}`);
  }

  const data = await res.json();
  const text = data.content?.[0]?.type === 'text' ? data.content[0].text : '';
  return parseAIResponse(text);
}
