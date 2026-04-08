/**
 * Career-Ops CLI - LLM Client
 * Supports OpenRouter and Anthropic APIs
 */

import fetch from 'node-fetch';

export class LLMClient {
  constructor(apiKey, model = 'openrouter/auto', provider = 'openrouter') {
    this.apiKey = apiKey;
    this.model = model;
    this.provider = provider;
  }
  
  async chat(prompt, options = {}) {
    if (this.provider === 'openrouter') {
      return this.callOpenRouter(prompt, options);
    } else if (this.provider === 'anthropic') {
      return this.callAnthropic(prompt, options);
    } else {
      throw new Error(`Unknown provider: ${this.provider}`);
    }
  }
  
  async callOpenRouter(prompt, options = {}) {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://career-ops.local',
        'X-Title': 'Career-Ops CLI'
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { 
            role: 'system', 
            content: options.systemPrompt || 'You are a career coach evaluating job opportunities.' 
          },
          { role: 'user', content: prompt }
        ],
        max_tokens: options.maxTokens || 4000,
        temperature: options.temperature || 0.7
      })
    });
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenRouter API error: ${response.status} - ${error}`);
    }
    
    const data = await response.json();
    
    if (!data.choices || !data.choices[0]) {
      throw new Error('Invalid response from OpenRouter API');
    }
    
    return data.choices[0].message.content;
  }
  
  async callAnthropic(prompt, options = {}) {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: this.model === 'openrouter/auto' ? 'claude-3-haiku-20240307' : this.model,
        max_tokens: options.maxTokens || 4000,
        messages: [{ role: 'user', content: prompt }]
      })
    });
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Anthropic API error: ${response.status} - ${error}`);
    }
    
    const data = await response.json();
    
    if (!data.content || !data.content[0]) {
      throw new Error('Invalid response from Anthropic API');
    }
    
    return data.content[0].text;
  }
  
  // Stream response for long evaluations
  async *chatStream(prompt, options = {}) {
    // Implementation for streaming (future enhancement)
    const result = await this.chat(prompt, options);
    yield result;
  }
}
