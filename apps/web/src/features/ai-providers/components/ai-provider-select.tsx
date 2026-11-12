import { type AiProvider, aiProviderKindOf } from "@openmonetis/domain/ai-providers";
import { MobileSelect as Select } from "@/components/forms/mobile-select";
import { MobileSelectContent as SelectContent } from "@/components/forms/mobile-select-content";
import {
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { aiProviderLabels } from "../ai-providers.presentation";
import { AiProviderMark } from "./ai-provider-mark";
import { aiSelectContentClassName, aiSelectItemClassName } from "./ai-select-styles";

/** Choice among the connected assistants, each with its brand mark. */
export function AiProviderSelect({
  className,
  disabled,
  onValueChange,
  providers,
  size = "default",
  value,
}: {
  className?: string;
  disabled?: boolean;
  onValueChange: (provider: AiProvider) => void;
  providers: readonly AiProvider[];
  size?: "sm" | "default";
  value: AiProvider;
}) {
  return (
    <Select
      disabled={disabled}
      onValueChange={(next) => {
        if (next) onValueChange(next as AiProvider);
      }}
      value={value}
    >
      <SelectTrigger aria-label="Assistente" className={className} size={size}>
        <SelectValue>
          <AiProviderMark provider={value} size={16} />
          {aiProviderLabels[value]}
        </SelectValue>
      </SelectTrigger>
      <SelectContent className={aiSelectContentClassName}>
        {(["subscription", "apiKey"] as const).map((kind) => {
          const group = providers.filter((provider) => aiProviderKindOf(provider) === kind);
          if (!group.length) return null;
          return (
            <SelectGroup key={kind}>
              <SelectLabel>{kind === "subscription" ? "Assinaturas" : "Chaves de API"}</SelectLabel>
              {group.map((provider) => (
                <SelectItem className={aiSelectItemClassName} key={provider} value={provider}>
                  <AiProviderMark provider={provider} size={16} />
                  {aiProviderLabels[provider]}
                </SelectItem>
              ))}
            </SelectGroup>
          );
        })}
      </SelectContent>
    </Select>
  );
}
