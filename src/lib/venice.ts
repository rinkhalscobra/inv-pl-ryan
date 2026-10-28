import { supabase } from './supabaseClient';

export type VeniceChatRole = 'system' | 'user' | 'assistant';

export interface VeniceChatMessage {
  role: VeniceChatRole;
  content: string;
}

export interface VeniceChatCompletion {
  id: string;
  model: string;
  choices: Array<{
    index: number;
    finish_reason: string | null;
    message: {
      role: 'assistant';
      content: string | null;
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

interface VeniceChatOptions {
  temperature?: number;
  maxCompletionTokens?: number;
}

export async function createVeniceChatCompletion(
  messages: VeniceChatMessage[],
  options: VeniceChatOptions = {},
): Promise<VeniceChatCompletion> {
  const { data, error } = await supabase.functions.invoke<VeniceChatCompletion>(
    'venice-chat',
    {
      body: {
        messages,
        temperature: options.temperature,
        max_completion_tokens: options.maxCompletionTokens,
      },
    },
  );

  if (error) throw new Error(`Venice chat request failed: ${error.message}`);
  if (!data?.choices?.length) throw new Error('Venice returned no chat choices');
  return data;
}
