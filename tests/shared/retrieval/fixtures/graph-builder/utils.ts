// Fixture: utils.ts — standalone utility functions

export function formatName(raw: string): string {
  return capitalize(raw.trim());
}

export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export function isEmpty(value: string): boolean {
  return value.trim().length === 0;
}

// modified
