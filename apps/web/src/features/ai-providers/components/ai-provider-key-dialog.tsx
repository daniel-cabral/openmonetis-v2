import { type AiApiKeyProvider, aiApiKeyRequired } from "@openmonetis/domain/ai-providers";
import { SaveAiProviderKeyInputSchema } from "@openmonetis/validators/ai-providers";
import { useForm } from "@tanstack/react-form";
import { LoaderCircle } from "lucide-react";
import { useId } from "react";
import { toast } from "sonner";
import { MobileFormContent as DialogContent } from "@/components/forms/mobile-form-content";
import { MobileFormDialog as Dialog } from "@/components/forms/mobile-form-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { showInvalidFormToast } from "@/lib/form-feedback";
import { useSaveAiProviderKeyMutation } from "../ai-providers.mutations";
import { aiProviderErrorMessage, aiProviderLabels } from "../ai-providers.presentation";

/** Saves an API key after the vendor validates it; the key is cleared from the form on success. */
export function AiProviderKeyDialog({
  onOpenChange,
  open,
  provider,
}: {
  onOpenChange: (open: boolean) => void;
  open: boolean;
  provider: AiApiKeyProvider;
}) {
  const label = aiProviderLabels[provider];
  const keyRequired = aiApiKeyRequired(provider);
  const keyId = useId();
  const consentId = useId();
  const saveMutation = useSaveAiProviderKeyMutation();
  const form = useForm({
    defaultValues: { apiKey: "", consent: false },
    onSubmitInvalid: showInvalidFormToast,
    validators: {
      onSubmit: ({ value }) => {
        const apiKey = value.apiKey.trim();
        if (!value.consent) return { fields: { consent: "Confirme para continuar." } };
        if (keyRequired && !apiKey) return { fields: { apiKey: "Informe a chave de API." } };
        const valid = SaveAiProviderKeyInputSchema.safeParse({
          apiKey: apiKey || undefined,
          consent: true,
        });
        return valid.success ? undefined : { fields: { apiKey: "A chave informada é inválida." } };
      },
    },
    onSubmit: async ({ value }) => {
      try {
        await saveMutation.mutateAsync({
          provider,
          input: { apiKey: value.apiKey.trim() || undefined, consent: true },
        });
        toast.success(`${label} conectado`);
        form.reset();
        onOpenChange(false);
      } catch (error) {
        toast.error(aiProviderErrorMessage(error));
      }
    },
  });

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Conectar {label}</DialogTitle>
          <DialogDescription>
            Use a sua própria chave. Ela é criptografada e nunca é exibida de novo.
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            event.stopPropagation();
            void form.handleSubmit();
          }}
        >
          <form.Field name="apiKey">
            {(field) => (
              <div className="grid gap-2">
                <Label htmlFor={keyId}>Chave de API{keyRequired ? "" : " (opcional)"}</Label>
                <Input
                  autoComplete="off"
                  id={keyId}
                  name="apiKey"
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                  type="password"
                  value={field.state.value}
                />
                {field.state.meta.errors.length ? (
                  <p className="text-destructive text-xs">{String(field.state.meta.errors[0])}</p>
                ) : null}
              </div>
            )}
          </form.Field>
          <form.Field name="consent">
            {(field) => (
              <div className="grid gap-2">
                <div className="flex items-start gap-2.5">
                  <Checkbox
                    checked={field.state.value}
                    id={consentId}
                    onCheckedChange={(checked) => field.handleChange(checked === true)}
                  />
                  <Label className="font-normal text-sm leading-snug" htmlFor={consentId}>
                    Entendo que os dados financeiros permitidos por mim serão enviados a {label},
                    usando a minha chave.
                  </Label>
                </div>
                {field.state.meta.errors.length ? (
                  <p className="text-destructive text-xs">{String(field.state.meta.errors[0])}</p>
                ) : null}
              </div>
            )}
          </form.Field>
          <DialogFooter>
            <Button onClick={() => onOpenChange(false)} type="button" variant="outline">
              Cancelar
            </Button>
            <form.Subscribe selector={(state) => state.isSubmitting}>
              {(isSubmitting) => (
                <Button disabled={isSubmitting} type="submit">
                  {isSubmitting ? (
                    <LoaderCircle aria-hidden="true" className="animate-spin" />
                  ) : null}
                  {isSubmitting ? "Validando…" : "Validar e salvar"}
                </Button>
              )}
            </form.Subscribe>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
