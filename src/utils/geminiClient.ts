// Gemini API client for BlueEdge
import axios from 'axios';

// Interface for Gemini API request
interface GeminiRequest {
  contents: {
    role: string;
    parts: {
      text: string;
    }[];
  }[];
  generationConfig: {
    temperature: number;
    maxOutputTokens: number;
    topP?: number;
    topK?: number;
  };
}

// Interface for Gemini API response
interface GeminiResponse {
  candidates: {
    content: {
      parts: {
        text: string;
      }[];
    };
    finishReason: string;
  }[];
  promptFeedback?: {
    blockReason?: string;
  };
}

/**
 * Client for interacting with Google's Gemini API
 */
export class GeminiClient {
  private apiKey: string;
  private baseUrl: string;
  private model: string;

  /**
   * Create a new Gemini client
   * @param apiKey Google API key for Gemini
   * @param model Gemini model to use (defaults to gemini-1.5-pro)
   */
  constructor(apiKey: string, model: string = 'gemini-1.5-pro') {
    // Remove any whitespace or newlines from the API key
    this.apiKey = apiKey.trim();
    this.model = model;
    this.baseUrl = `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent`;
  }

  /**
   * Generate content using Gemini API
   * @param systemPrompt System prompt (instructions)
   * @param userPrompt User prompt (query and context)
   * @param temperature Temperature for generation (0.0 to 1.0)
   * @param maxOutputTokens Maximum tokens to generate
   * @returns Generated text
   */
  async generateContent(
    systemPrompt: string,
    userPrompt: string,
    temperature: number = 0.2,
    maxOutputTokens: number = 2048
  ): Promise<string> {
    try {
      // Combine system prompt and user prompt for Gemini
      // Gemini doesn't have a dedicated system message, so we prepend it to the user message
      const combinedPrompt = `${systemPrompt}\n\n${userPrompt}`;
      
      const requestData: GeminiRequest = {
        contents: [
          {
            role: 'user',
            parts: [{ text: combinedPrompt }]
          }
        ],
        generationConfig: {
          temperature,
          maxOutputTokens,
          topP: 0.95,
          topK: 40
        }
      };

      const response = await axios.post<GeminiResponse>(
        `${this.baseUrl}?key=${this.apiKey}`,
        requestData,
        {
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );

      // Check if the response was blocked
      if (response.data.promptFeedback?.blockReason) {
        throw new Error(`Gemini blocked the request: ${response.data.promptFeedback.blockReason}`);
      }

      // Extract the generated text
      if (response.data.candidates && response.data.candidates.length > 0) {
        const generatedText = response.data.candidates[0].content.parts
          .map(part => part.text)
          .join('');
        return generatedText;
      }

      return 'No response generated';
    } catch (error) {
      console.error('Error calling Gemini API:', error);
      if (axios.isAxiosError(error) && error.response) {
        throw new Error(`Gemini API error (${error.response.status}): ${JSON.stringify(error.response.data)}`);
      }
      throw error;
    }
  }

  /**
   * Check if the Gemini API key is valid
   * @returns True if the API key is valid
   */
  async isValidApiKey(): Promise<boolean> {
    try {
      // Make a simple request to check if the API key is valid
      await this.generateContent('Hello', 'Test', 0.1, 10);
      return true;
    } catch (error) {
      console.error('Invalid Gemini API key:', error);
      return false;
    }
  }
}

/**
 * Create a Gemini client from environment variables
 * @returns Gemini client instance
 */
export const createGeminiClient = (): GeminiClient | null => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'your_gemini_api_key_here') {
    console.warn('Valid GEMINI_API_KEY not found in environment variables');
    return null;
  }
  
  // Log that we're creating a Gemini client (for debugging)
  console.log('Creating Gemini client with API key length:', apiKey.length);
  
  return new GeminiClient(apiKey);
};
