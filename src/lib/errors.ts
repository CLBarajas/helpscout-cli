import type { HelpScoutError } from '../types/index.js';
import { outputJson } from './output.js';

export class HelpScoutCliError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
  ) {
    super(message);
    this.name = 'HelpScoutCliError';
  }
}

const ERROR_STATUS_CODES: Record<string, number> = {
  bad_request: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  too_many_requests: 429,
  internal_server_error: 500,
  service_unavailable: 503,
};

export function sanitizeErrorMessage(message: string): string {
  const sensitivePatterns = [
    /Bearer\s+[\w\-._~+/]+=*/gi,
    /token[=:]\s*[\w\-._~+/]+=*/gi,
    /client[_-]?secret[=:]\s*[\w\-._~+/]+=*/gi,
    /authorization:\s*bearer\s+[\w\-._~+/]+=*/gi,
  ];

  let sanitized = message;
  for (const pattern of sensitivePatterns) {
    sanitized = sanitized.replace(pattern, '[REDACTED]');
  }

  return sanitized.length > 500 ? sanitized.substring(0, 500) + '...' : sanitized;
}

interface ApiErrorResponse {
  error?: string;
  error_description?: string;
  message?: string;
  _embedded?: {
    errors?: Array<{
      path?: string;
      message?: string;
      rejectedValue?: string;
    }>;
  };
}

function isErrorObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function sanitizeApiError(error: unknown): HelpScoutError {
  if (!isErrorObject(error)) {
    return {
      name: 'api_error',
      detail: 'An error occurred',
    };
  }

  const apiError = error as ApiErrorResponse;

  let detail = 'An error occurred';
  if (apiError.error_description) {
    detail = apiError.error_description;
  } else if (apiError.message) {
    detail = apiError.message;
  } else if (apiError._embedded?.errors?.length) {
    detail = apiError._embedded.errors
      .map(e => e.message || e.path)
      .filter(Boolean)
      .join('; ');
  }

  return {
    name: apiError.error || 'api_error',
    detail: sanitizeErrorMessage(detail),
  };
}

function enhanceRateLimitMessage(detail: string): string {
  return `${detail}\n\nHelp Scout API limit: 200 requests/minute. Wait a moment and retry.`;
}

function formatErrorResponse(name: string, detail: string, statusCode: number): never {
  const enhancedDetail = name === 'too_many_requests'
    ? enhanceRateLimitMessage(detail)
    : detail;

  outputJson({ error: { name, detail: enhancedDetail, statusCode } });
  process.exit(1);
}

export function handleHelpScoutError(error: unknown): never {
  if (!isErrorObject(error)) {
    formatErrorResponse('unknown_error', 'An unexpected error occurred', 1);
  }

  const errorObj = error as { error?: unknown; message?: string; statusCode?: number };

  if (error instanceof HelpScoutCliError) {
    const sanitized = sanitizeErrorMessage(error.message);
    formatErrorResponse('cli_error', sanitized, error.statusCode || 1);
  }

  if (errorObj.error) {
    const hsError: HelpScoutError = sanitizeApiError(errorObj);
    formatErrorResponse(
      hsError.name,
      hsError.detail,
      errorObj.statusCode || ERROR_STATUS_CODES[hsError.name] || 500,
    );
  }

  const sanitized = sanitizeErrorMessage(errorObj.message || 'An unexpected error occurred');
  formatErrorResponse('unknown_error', sanitized, errorObj.statusCode || 1);
}
