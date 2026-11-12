export const settingsConfirmation = {
  reset: "ZERAR",
  delete: "EXCLUIR",
} as const;

export type SettingsDangerousAction = keyof typeof settingsConfirmation;

export class InvalidSettingsConfirmationError extends Error {
  constructor(readonly action: SettingsDangerousAction) {
    super("Invalid settings confirmation");
    this.name = "InvalidSettingsConfirmationError";
  }
}

export function assertSettingsConfirmation(action: SettingsDangerousAction, confirmation: string) {
  if (confirmation !== settingsConfirmation[action]) {
    throw new InvalidSettingsConfirmationError(action);
  }
}

export const freshSessionMaxAgeSeconds = 600;

const millisecondsPerSecond = 1_000;

export function isFreshSession(createdAt: Date, now: Date): boolean {
  return now.getTime() - createdAt.getTime() <= freshSessionMaxAgeSeconds * millisecondsPerSecond;
}

export function normalizeAccountEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isSameAccountEmail(a: string, b: string): boolean {
  return normalizeAccountEmail(a) === normalizeAccountEmail(b);
}
