/**
 * Security Utilities
 * 
 * Helper functions to prevent sensitive data from being exposed in logs.
 */

/**
 * Mask sensitive string for safe logging
 * Completely hides the value to prevent any exposure
 * 
 * @example
 * maskSensitive("AIzaSyABC123XYZ789") => "[REDACTED]"
 */
export function maskSensitive(value: string | undefined | null): string {
    if (!value) return '[REDACTED]';
    return '[REDACTED]';
}

/**
 * Create a safe logging wrapper that automatically masks API keys
 * Prevents accidental exposure of sensitive data in console logs
 */
export const safeLogger = {
    log: (...args: unknown[]) => {
        console.log(...args.map(sanitizeLogArg));
    },
    warn: (...args: unknown[]) => {
        console.warn(...args.map(sanitizeLogArg));
    },
    error: (...args: unknown[]) => {
        console.error(...args.map(sanitizeLogArg));
    },
    info: (...args: unknown[]) => {
        console.info(...args.map(sanitizeLogArg));
    }
};

/**
 * Sanitize a single log argument, masking any potential API keys
 */
function sanitizeLogArg(arg: unknown): unknown {
    if (typeof arg === 'string') {
        return maskApiKeyPatterns(arg);
    }
    if (typeof arg === 'object' && arg !== null) {
        return sanitizeObject(arg as Record<string, unknown>);
    }
    return arg;
}

/**
 * Recursively sanitize an object, masking sensitive fields
 */
function sanitizeObject(obj: Record<string, unknown>): Record<string, unknown> {
    const sensitiveKeys = ['apikey', 'api_key', 'apiKey', 'key', 'token', 'secret', 'password', 'authorization'];
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(obj)) {
        if (sensitiveKeys.some(sk => key.toLowerCase().includes(sk.toLowerCase()))) {
            result[key] = maskSensitive(String(value));
        } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
            result[key] = sanitizeObject(value as Record<string, unknown>);
        } else {
            result[key] = value;
        }
    }

    return result;
}

/**
 * Mask common API key patterns in a string
 * Detects and masks:
 * - AIza... (Google API keys)
 * - sk-... (OpenAI keys)
 * - Generic long alphanumeric strings
 */
function maskApiKeyPatterns(text: string): string {
    // Google API Key pattern (AIza followed by alphanumeric)
    let result = text.replace(/AIza[A-Za-z0-9_-]{30,}/g, (match) => maskSensitive(match));

    // OpenAI API Key pattern
    result = result.replace(/sk-[A-Za-z0-9]{40,}/g, (match) => maskSensitive(match));

    // Generic API key patterns in query strings or JSON
    result = result.replace(/["']?api[_-]?key["']?\s*[:=]\s*["']?([A-Za-z0-9_-]{20,})["']?/gi,
        (match, key) => match.replace(key, maskSensitive(key)));

    return result;
}
