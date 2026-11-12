import { ChangeAccountEmailInputSchema } from "@openmonetis/validators/settings";
import { useForm } from "@tanstack/react-form";
import { useQuery } from "@tanstack/react-query";
import { LoaderCircle, Mail } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";
import { MobileFormContent } from "@/components/forms/mobile-form-content";
import { MobileFormDialog } from "@/components/forms/mobile-form-dialog";
import { MobileFormState } from "@/components/forms/mobile-form-state";
import { Button } from "@/components/ui/button";
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { authClient } from "@/lib/auth-client";
import { SettingsApiError } from "../settings.api";
import { useChangeAccountEmailMutation } from "../settings.mutations";
import { changeEmailErrorMessage } from "../settings.presentation";
import { settingsSecurityQueryOptions } from "../settings.queries";

export function ChangeEmailDialog({
  currentEmail,
  onOpenChange,
  open,
}: {
  currentEmail: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  return (
    <MobileFormDialog onOpenChange={onOpenChange} open={open}>
      <MobileFormContent guarded mobileLayout="sheet" className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Alterar e-mail</DialogTitle>
          <DialogDescription>Use o novo endereço no próximo acesso.</DialogDescription>
        </DialogHeader>
        {open ? (
          <ChangeEmailForm
            currentEmail={currentEmail}
            onCancel={() => onOpenChange(false)}
            onSuccess={() => onOpenChange(false)}
          />
        ) : null}
      </MobileFormContent>
    </MobileFormDialog>
  );
}

function ChangeEmailForm({
  currentEmail,
  onCancel,
  onSuccess,
}: {
  currentEmail: string;
  onCancel: () => void;
  onSuccess: () => void;
}) {
  const id = useId();
  const securityQuery = useQuery(settingsSecurityQueryOptions());
  const mutation = useChangeAccountEmailMutation();
  const [error, setError] = useState<string | null>(null);
  const [needsGoogleLogin, setNeedsGoogleLogin] = useState(false);
  const passwordRequired = securityQuery.data?.passwordChangeAvailable === true;

  const form = useForm({
    defaultValues: { newEmail: "", currentPassword: "" },
    onSubmit: async ({ value }) => {
      setError(null);
      setNeedsGoogleLogin(false);
      if (value.newEmail.trim().toLowerCase() === currentEmail.trim().toLowerCase()) {
        setError("O novo e-mail deve ser diferente do atual");
        return;
      }

      const parsed = ChangeAccountEmailInputSchema.safeParse({
        newEmail: value.newEmail,
        ...(passwordRequired ? { currentPassword: value.currentPassword } : {}),
      });
      if (!parsed.success) {
        setError("Revise o e-mail informado.");
        return;
      }

      try {
        const result = await mutation.mutateAsync(parsed.data);
        toast.success(
          result.verificationEmailSent
            ? "E-mail alterado. Enviamos um link de confirmação para o novo endereço."
            : "E-mail alterado. Esta instalação não envia e-mails, então nenhuma confirmação foi enviada.",
        );
        onSuccess();
      } catch (cause) {
        setError(changeEmailErrorMessage(cause));
        setNeedsGoogleLogin(
          cause instanceof SettingsApiError && cause.code === "fresh_session_required",
        );
      } finally {
        mutation.reset();
      }
    },
  });

  return (
    <form
      data-mobile-page-form
      className="grid gap-4"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <form.Subscribe
        selector={(state) => ({ isDirty: !state.isDefaultValue, isSubmitting: state.isSubmitting })}
      >
        {(state) => <MobileFormState {...state} />}
      </form.Subscribe>

      <form.Field name="newEmail">
        {(field) => (
          <div className="grid gap-2">
            <Label className="font-mono text-sm tracking-normal" htmlFor={`${id}-new-email`}>
              Novo e-mail
            </Label>
            <Input
              autoComplete="email"
              disabled={mutation.isPending}
              id={`${id}-new-email`}
              onBlur={field.handleBlur}
              onChange={(event) => field.handleChange(event.target.value)}
              type="email"
              value={field.state.value}
            />
          </div>
        )}
      </form.Field>

      {passwordRequired ? (
        <form.Field name="currentPassword">
          {(field) => (
            <div className="grid gap-2">
              <Label className="font-mono text-sm tracking-normal" htmlFor={`${id}-password`}>
                Senha atual
              </Label>
              <PasswordInput
                aria-describedby={`${id}-password-hint`}
                autoComplete="current-password"
                disabled={mutation.isPending}
                id={`${id}-password`}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
                value={field.state.value}
              />
              <p className="text-muted-foreground text-xs" id={`${id}-password-hint`}>
                As outras sessões abertas serão encerradas.
              </p>
            </div>
          )}
        </form.Field>
      ) : (
        <p className="rounded-lg bg-muted/40 p-3 text-muted-foreground text-sm leading-relaxed">
          Você entra com Google. Para confirmar que é você, entre novamente com Google e volte para
          salvar.
        </p>
      )}

      {error ? (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      ) : null}

      {needsGoogleLogin ? (
        <Button
          className="justify-self-start"
          onClick={() =>
            void authClient.signIn.social({
              provider: "google",
              callbackURL: "/settings?tab=profile",
            })
          }
          type="button"
          variant="outline"
        >
          Entrar novamente com Google
        </Button>
      ) : null}

      <form.Subscribe selector={(state) => state.isSubmitting}>
        {(isSubmitting) => (
          <DialogFooter>
            <Button
              data-mobile-cancel
              disabled={isSubmitting}
              onClick={onCancel}
              type="button"
              variant="outline"
            >
              Cancelar
            </Button>
            <Button disabled={isSubmitting} type="submit">
              {isSubmitting ? (
                <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
              ) : (
                <Mail aria-hidden="true" className="size-4" />
              )}
              {isSubmitting ? "Alterando..." : "Alterar e-mail"}
            </Button>
          </DialogFooter>
        )}
      </form.Subscribe>
    </form>
  );
}
