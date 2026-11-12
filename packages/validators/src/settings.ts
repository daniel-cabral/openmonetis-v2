import { z } from "@hono/zod-openapi";
import { settingsConfirmation } from "@openmonetis/domain/settings";

export { settingsConfirmation } from "@openmonetis/domain/settings";

export const ResetSettingsInputSchema = z
  .object({ confirmation: z.literal(settingsConfirmation.reset) })
  .strict()
  .openapi("ResetSettingsInput");

export const DeleteSettingsAccountInputSchema = z
  .object({ confirmation: z.literal(settingsConfirmation.delete) })
  .strict()
  .openapi("DeleteSettingsAccountInput");

export const ResetSettingsOutputSchema = z
  .object({ reset: z.literal(true) })
  .openapi("ResetSettingsOutput");

export const DeleteSettingsAccountOutputSchema = z
  .object({ deleted: z.literal(true) })
  .openapi("DeleteSettingsAccountOutput");

export const SettingsSecurityOutputSchema = z
  .object({ passwordChangeAvailable: z.boolean() })
  .openapi("SettingsSecurityOutput");

export const ChangeAccountEmailInputSchema = z
  .object({
    newEmail: z.string().trim().toLowerCase().pipe(z.email().max(320)),
    currentPassword: z.string().min(1).max(128).optional(),
  })
  .strict()
  .openapi("ChangeAccountEmailInput");

export const ChangeAccountEmailOutputSchema = z
  .object({ email: z.email(), verificationEmailSent: z.boolean() })
  .openapi("ChangeAccountEmailOutput");

export type ChangeAccountEmailInput = z.infer<typeof ChangeAccountEmailInputSchema>;
export type ChangeAccountEmailOutput = z.infer<typeof ChangeAccountEmailOutputSchema>;
export type ResetSettingsInput = z.infer<typeof ResetSettingsInputSchema>;
export type DeleteSettingsAccountInput = z.infer<typeof DeleteSettingsAccountInputSchema>;
export type ResetSettingsOutput = z.infer<typeof ResetSettingsOutputSchema>;
export type DeleteSettingsAccountOutput = z.infer<typeof DeleteSettingsAccountOutputSchema>;
export type SettingsSecurityOutput = z.infer<typeof SettingsSecurityOutputSchema>;
