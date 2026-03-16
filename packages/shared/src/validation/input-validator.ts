/**
 * Sanitize a natural-language query input.
 *
 * - Trims whitespace
 * - Strips control characters (except newlines and tabs)
 * - Truncates to 1000 characters
 *
 * @param input - Raw user input.
 * @returns Sanitized string safe for downstream processing.
 */
export function sanitizeNaturalLanguage(input: string): string {
  // Strip control characters (U+0000-U+001F) except \n (0x0A) and \t (0x09)
  const cleaned = input.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
  const trimmed = cleaned.trim();
  return trimmed.slice(0, 1000);
}

/**
 * Validate an email address.
 *
 * Uses a pragmatic regex that covers the vast majority of real-world addresses
 * without attempting full RFC 5322 compliance.
 *
 * @param email - The email string to validate.
 * @returns `true` if the email is valid.
 */
export function validateEmail(email: string): boolean {
  if (!email || email.length > 254) return false;
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(email);
}

/**
 * Validate a URL-safe slug.
 *
 * Rules:
 * - 3 to 50 characters
 * - Only lowercase alphanumeric characters and hyphens
 * - Must start and end with an alphanumeric character
 *
 * @param slug - The slug string to validate.
 * @returns `true` if the slug is valid.
 */
export function validateSlug(slug: string): boolean {
  if (!slug) return false;
  const regex = /^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/;
  return regex.test(slug);
}

/**
 * Validate a basic 5-field cron expression.
 *
 * Supports:
 * - Numeric values within each field's range
 * - Wildcards (`*`)
 * - Step values (`*​/5`)
 * - Ranges (`1-5`)
 * - Lists (`1,3,5`)
 *
 * Field order: minute hour day-of-month month day-of-week
 *
 * @param cron - The cron expression to validate.
 * @returns `true` if the expression is structurally valid.
 */
export function validateCronExpression(cron: string): boolean {
  if (!cron) return false;

  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return false;

  // Each field: allowed range [min, max]
  const ranges: [number, number][] = [
    [0, 59],  // minute
    [0, 23],  // hour
    [1, 31],  // day of month
    [1, 12],  // month
    [0, 7],   // day of week (0 and 7 = Sunday)
  ];

  for (let i = 0; i < 5; i++) {
    if (!isValidCronField(parts[i], ranges[i][0], ranges[i][1])) {
      return false;
    }
  }

  return true;
}

/**
 * Validate a single cron field against its allowed range.
 */
function isValidCronField(field: string, min: number, max: number): boolean {
  // Wildcard
  if (field === '*') return true;

  // Step on wildcard: */n
  if (field.startsWith('*/')) {
    const step = Number(field.slice(2));
    return Number.isInteger(step) && step >= 1 && step <= max;
  }

  // List: 1,3,5
  const items = field.split(',');
  for (const item of items) {
    // Range: 1-5 or range with step: 1-5/2
    if (item.includes('-')) {
      const [rangePart, stepPart] = item.split('/');
      const [startStr, endStr] = rangePart.split('-');
      const start = Number(startStr);
      const end = Number(endStr);
      if (!Number.isInteger(start) || !Number.isInteger(end)) return false;
      if (start < min || start > max || end < min || end > max) return false;
      if (start > end) return false;
      if (stepPart !== undefined) {
        const step = Number(stepPart);
        if (!Number.isInteger(step) || step < 1) return false;
      }
    } else {
      const num = Number(item);
      if (!Number.isInteger(num) || num < min || num > max) return false;
    }
  }

  return true;
}
