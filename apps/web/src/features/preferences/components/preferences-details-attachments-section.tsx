import {
  type AttachmentSizeLimitMb,
  attachmentSizeLimitOptionsMb,
} from "@openmonetis/domain/attachments";
import { Paperclip } from "lucide-react";
import { useId } from "react";
import { MobileSelect as Select } from "@/components/forms/mobile-select";
import { MobileSelectContent as SelectContent } from "@/components/forms/mobile-select-content";
import { SettingsSection } from "@/components/settings-panel";
import { SettingsRow } from "@/components/settings-row";
import { SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { attachmentSizeLimitLabel } from "../preferences.presentation";
import type { PreferencesFormApi } from "../usePreferencesForm";
import { PreferenceSwitchRow } from "./preferences-transactions-list-section";

export function PreferencesDetailsAttachmentsSection({
  form,
  disabled: isMutating,
}: {
  form: PreferencesFormApi;
  disabled: boolean;
}) {
  const summaryId = useId();
  const attachmentSizeId = useId();
  return (
    <SettingsSection
      description="Resumo nos detalhes do lançamento e limite dos seus anexos."
      icon={Paperclip}
      title="Detalhes e anexos"
    >
      <div className="grid gap-4">
        <form.Field name="showTransactionSummary">
          {(field) => (
            <PreferenceSwitchRow
              checked={field.state.value}
              description="Exibe o bloco de resumo no topo dos detalhes do lançamento."
              disabled={isMutating}
              id={summaryId}
              label="Mostrar resumo nos detalhes"
              onCheckedChange={field.handleChange}
            />
          )}
        </form.Field>

        <form.Field name="attachmentMaxSizeMb">
          {(field) => (
            <SettingsRow
              description="Opções: 5, 10, 25 ou 50 MB (teto da instalação). Vale para novos anexos de lançamentos e anotações; os já enviados continuam."
              id={attachmentSizeId}
              label="Tamanho máximo de anexo"
            >
              <Select
                disabled={isMutating}
                onValueChange={(value) =>
                  value && field.handleChange(Number(value) as AttachmentSizeLimitMb)
                }
                value={String(field.state.value)}
              >
                <SelectTrigger
                  aria-describedby={`${attachmentSizeId}-description`}
                  className="w-full"
                  id={attachmentSizeId}
                >
                  <SelectValue>{attachmentSizeLimitLabel(field.state.value)}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {attachmentSizeLimitOptionsMb.map((limit) => (
                    <SelectItem key={limit} value={String(limit)}>
                      {attachmentSizeLimitLabel(limit)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </SettingsRow>
          )}
        </form.Field>
      </div>
    </SettingsSection>
  );
}
