import { describe, it, expect } from 'vitest';
import { sanitizeErrorMessage, sanitizeApiError } from './errors.js';

describe('sanitizeErrorMessage', () => {
  it.each([
    {
      pattern: 'Bearer tokens',
      input: 'Authorization: Bearer abc123token456',
      shouldNotContain: 'abc123token456',
    },
    {
      pattern: 'token key-value pairs',
      input: 'Error: token=my-secret-token-value',
      shouldNotContain: 'my-secret-token-value',
    },
    {
      pattern: 'client secrets',
      input: 'Failed: client_secret=super-secret-key',
      shouldNotContain: 'super-secret-key',
    },
  ])('should redact $pattern', ({ input, shouldNotContain }) => {
    const result = sanitizeErrorMessage(input);
    expect(result).not.toContain(shouldNotContain);
    expect(result).toContain('[REDACTED]');
  });

  it('should handle multiple sensitive patterns in one message', () => {
    const message = 'Auth failed: Bearer token123 with client_secret=secret';
    const result = sanitizeErrorMessage(message);
    expect(result).not.toContain('token123');
    expect(result).not.toContain('secret');
  });

  it('should truncate long messages', () => {
    const longMessage = 'Error: ' + 'x'.repeat(600);
    const result = sanitizeErrorMessage(longMessage);
    expect(result.length).toBe(503);
    expect(result.endsWith('...')).toBe(true);
  });

  it('should not modify safe messages', () => {
    const message = 'Conversation not found';
    const result = sanitizeErrorMessage(message);
    expect(result).toBe(message);
  });
});

describe('sanitizeApiError', () => {
  it('should extract error from error_description field', () => {
    const error = {
      error: 'unauthorized',
      error_description: 'Invalid client credentials',
    };
    const result = sanitizeApiError(error);
    expect(result.name).toBe('unauthorized');
    expect(result.detail).toBe('Invalid client credentials');
  });

  it('should extract error from message field', () => {
    const error = {
      message: 'Resource not found',
    };
    const result = sanitizeApiError(error);
    expect(result.name).toBe('api_error');
    expect(result.detail).toBe('Resource not found');
  });

  it('should extract errors from _embedded.errors', () => {
    const error = {
      _embedded: {
        errors: [
          { path: 'subject', message: 'Subject is required' },
          { path: 'body', message: 'Body is required' },
        ],
      },
    };
    const result = sanitizeApiError(error);
    expect(result.detail).toBe('Subject is required; Body is required');
  });

  it('should handle minimal error objects', () => {
    const error = {};
    const result = sanitizeApiError(error);
    expect(result.name).toBe('api_error');
    expect(result.detail).toBe('An error occurred');
  });

  it('should handle non-object errors', () => {
    const result = sanitizeApiError('string error');
    expect(result.name).toBe('api_error');
    expect(result.detail).toBe('An error occurred');
  });

  it('should sanitize sensitive data in error details', () => {
    const error = {
      error_description: 'Failed with Bearer abc123token',
    };
    const result = sanitizeApiError(error);
    expect(result.detail).not.toContain('abc123token');
    expect(result.detail).toContain('[REDACTED]');
  });
});
