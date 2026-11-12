import { SettingsApiError } from "./settings.api";

export const settingsTabs = [
  "profile",
  "preferences",
  "due-date-rules",
  "security",
  "integrations",
  "account-data",
] as const;
export type SettingsTab = (typeof settingsTabs)[number];
type SettingsSearch = { tab?: SettingsTab };

/** Keeps links shared before the tabs were renamed working. */
const legacySettingsTabs: Record<string, SettingsTab> = {
  companion: "integrations",
  "danger-zone": "account-data",
};

export function validateSettingsSearch(search: Record<string, unknown>): SettingsSearch {
  const tab =
    typeof search.tab === "string" ? (legacySettingsTabs[search.tab] ?? search.tab) : null;
  return settingsTabs.includes(tab as SettingsTab) ? { tab: tab as SettingsTab } : {};
}

export function settingsMutationErrorMessage(error: unknown) {
  if (
    error instanceof SettingsApiError &&
    (error.code === "rate_limited" || error.status === 429)
  ) {
    return "Muitas tentativas. Aguarde um minuto e tente novamente.";
  }

  if (error instanceof SettingsApiError && error.code === "SESSION_NOT_FRESH") {
    return "Por segurança, saia e entre novamente antes de gerenciar suas chaves de acesso.";
  }

  if (error instanceof SettingsApiError && error.status === 401) {
    return "Sua sessão expirou. Entre novamente para continuar.";
  }

  return "Não foi possível concluir a ação. Tente novamente.";
}

export function changeEmailErrorMessage(error: unknown): string {
  if (!(error instanceof SettingsApiError)) return "Não foi possível alterar o e-mail.";

  switch (error.code) {
    case "email_unchanged":
      return "O novo e-mail deve ser diferente do atual";
    case "email_change_rejected":
      return "Não foi possível alterar o e-mail. Confira os dados e tente novamente.";
    case "fresh_session_required":
      return "Entre novamente com Google para confirmar que é você.";
    case "rate_limited":
      return "Muitas tentativas. Aguarde um minuto.";
    default:
      return "Não foi possível alterar o e-mail.";
  }
}

export function passwordMutationErrorMessage(error: unknown) {
  if (error instanceof SettingsApiError && error.code === "PASSWORD_UNCHANGED") {
    return "A nova senha deve ser diferente da atual.";
  }

  if (error instanceof SettingsApiError && error.code === "INVALID_PASSWORD") {
    return "A senha atual está incorreta.";
  }

  if (error instanceof SettingsApiError && error.code === "CREDENTIAL_ACCOUNT_NOT_FOUND") {
    return "Esta conta não possui uma senha cadastrada.";
  }

  if (error instanceof SettingsApiError && error.code === "SESSION_NOT_FRESH") {
    return "Por segurança, saia e entre novamente antes de trocar a senha.";
  }

  if (error instanceof SettingsApiError && error.status === 429) {
    return "Muitas tentativas. Aguarde um minuto e tente novamente.";
  }

  if (error instanceof SettingsApiError && error.status === 401) {
    return "Sua sessão expirou. Entre novamente para continuar.";
  }

  return "Não foi possível trocar a senha. Tente novamente.";
}
