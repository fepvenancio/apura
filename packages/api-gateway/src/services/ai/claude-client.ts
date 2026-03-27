import Anthropic from '@anthropic-ai/sdk';

/**
 * ClaudeClient — wraps the Anthropic SDK for SQL generation.
 *
 * Handles:
 *   - Claude API calls with proper parameters
 *   - JSON response parsing with regex fallback
 *   - Retry logic (1 retry with error context)
 */

interface ClaudeResponse {
  sql: string;
  explanation: string;
  tokensUsed: { input: number; output: number };
}

export class ClaudeClient {
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  /**
   * Generate SQL from a system prompt and user prompt.
   * Uses temperature=0 for deterministic SQL generation.
   */
  async generateSql(
    systemPrompt: string,
    userPrompt: string,
    model: string,
  ): Promise<ClaudeResponse> {
    let lastError: Error | null = null;

    // Try up to 2 times (initial + 1 retry)
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const currentUserPrompt =
          attempt === 0
            ? userPrompt
            : `${userPrompt}\n\nNOTE: Your previous response was invalid. Error: ${lastError?.message}. Please return ONLY a valid JSON object with "sql" and "explanation" keys.`;

        const response = await this.client.messages.create({
          model,
          max_tokens: 2048,
          temperature: 0,
          system: systemPrompt,
          messages: [{ role: 'user', content: currentUserPrompt }],
        });

        // Extract text content from response
        const textContent = response.content.find(
          (block) => block.type === 'text',
        );
        if (!textContent || textContent.type !== 'text') {
          throw new Error('No text content in Claude response');
        }

        const rawText = textContent.text.trim();

        // Parse the response
        const parsed = this.parseResponse(rawText);

        return {
          sql: parsed.sql,
          explanation: parsed.explanation,
          tokensUsed: {
            input: response.usage.input_tokens,
            output: response.usage.output_tokens,
          },
        };
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));

        // Only retry on parsing errors, not API errors
        if (attempt === 0 && this.isParsingError(lastError)) {
          continue;
        }

        throw lastError;
      }
    }

    throw lastError ?? new Error('Failed to generate SQL after retries');
  }

  // ─── Private helpers ────────────────────────────────────────────────

  /**
   * Parse Claude's response text into sql + explanation.
   * First tries JSON.parse, then falls back to regex extraction.
   */
  private parseResponse(rawText: string): {
    sql: string;
    explanation: string;
  } {
    // Try direct JSON parse first
    try {
      const parsed = JSON.parse(rawText);
      if (typeof parsed.sql === 'string' && typeof parsed.explanation === 'string') {
        return { sql: parsed.sql, explanation: parsed.explanation };
      }
    } catch {
      // JSON parse failed, try regex fallback
    }

    // Try extracting JSON from within markdown code fences
    const jsonFenceMatch = rawText.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (jsonFenceMatch) {
      try {
        const parsed = JSON.parse(jsonFenceMatch[1].trim());
        if (typeof parsed.sql === 'string') {
          return {
            sql: parsed.sql,
            explanation: parsed.explanation ?? '',
          };
        }
      } catch {
        // Continue to regex fallback
      }
    }

    // Regex fallback: extract SQL from "sql" field
    const sqlMatch = rawText.match(/"sql"\s*:\s*"((?:[^"\\]|\\.)*)"/);
    const explanationMatch = rawText.match(
      /"explanation"\s*:\s*"((?:[^"\\]|\\.)*)"/,
    );

    if (sqlMatch) {
      return {
        sql: unescapeJsonString(sqlMatch[1]),
        explanation: explanationMatch
          ? unescapeJsonString(explanationMatch[1])
          : '',
      };
    }

    // Last resort: try to extract a bare SELECT statement
    const selectMatch = rawText.match(/(SELECT\s[\s\S]+?)(?:\n\n|$)/i);
    if (selectMatch) {
      return {
        sql: selectMatch[1].trim(),
        explanation: '',
      };
    }

    throw new Error(
      'Could not parse SQL from Claude response. Raw response: ' +
        rawText.substring(0, 200),
    );
  }

  /**
   * Check if an error is a parsing error (worth retrying)
   * vs an API error (not worth retrying).
   */
  private isParsingError(err: Error): boolean {
    return (
      err.message.includes('Could not parse SQL') ||
      err.message.includes('No text content')
    );
  }
}

/**
 * Unescape a JSON string value (handle \\n, \\t, \\\", etc.).
 */
function unescapeJsonString(s: string): string {
  return s
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\');
}
