import { handleHelpScoutError } from './errors.js';

export function withErrorHandling<T extends unknown[], R>(
  fn: (...args: T) => Promise<R>,
): (...args: T) => Promise<void> {
  return async (...args: T) => {
    try {
      await fn(...args);
    } catch (error) {
      handleHelpScoutError(error);
    }
  };
}

export async function confirmDelete(
  resourceType: string,
  skipConfirmation?: boolean,
): Promise<boolean> {
  if (skipConfirmation) {
    return true;
  }

  const readline = await import('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stderr,
  });

  return new Promise((resolve) => {
    rl.question(`Delete ${resourceType}? (y/N) `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y');
    });
  });
}
