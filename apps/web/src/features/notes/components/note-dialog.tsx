import type { CreateNoteInput, NoteOutput, ReplaceNoteInput } from "@openmonetis/validators/notes";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { MobileFormContent as DialogContent } from "@/components/forms/mobile-form-content";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { uploadNoteAttachment } from "@/features/attachments/attachments.api";
import {
  formatAttachmentUploadResult,
  formatPendingUploadFailure,
} from "@/features/attachments/attachments.presentation";
import { noteKindLabels } from "../notes.presentation";
import { NoteForm, type NoteFormHandle } from "./note-form";

type NoteDialogProps = {
  note: NoteOutput | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: CreateNoteInput | ReplaceNoteInput) => Promise<NoteOutput | null>;
  open: boolean;
  pending: boolean;
};

export function NoteDialog({ note, onOpenChange, onSubmit, open, pending }: NoteDialogProps) {
  const formRef = useRef<NoteFormHandle>(null);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [attachmentsBusy, setAttachmentsBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const busy = pending || attachmentsBusy || uploading;

  function requestOpenChange(nextOpen: boolean) {
    if (!nextOpen && busy) return;
    if (!nextOpen && (formRef.current?.hasUnsavedChanges() || pendingFiles.length > 0)) {
      setDiscardOpen(true);
      return;
    }
    onOpenChange(nextOpen);
  }

  async function submit(input: CreateNoteInput | ReplaceNoteInput) {
    const saved = await onSubmit(input);
    if (!saved) return;

    if (pendingFiles.length) {
      setUploading(true);
      let failed = 0;
      for (const file of pendingFiles) {
        try {
          await uploadNoteAttachment(file, saved.id);
        } catch {
          failed += 1;
        }
      }
      setUploading(false);
      const uploaded = pendingFiles.length - failed;
      if (uploaded) toast.success(formatAttachmentUploadResult(uploaded));
      if (failed) toast.error(formatPendingUploadFailure(failed));
    }
    onOpenChange(false);
  }

  return (
    <>
      <Dialog onOpenChange={requestOpenChange} open={open}>
        <DialogContent
          className="flex flex-col overflow-hidden sm:max-w-xl"
          showCloseButton={!busy}
        >
          <DialogHeader className="shrink-0">
            <DialogTitle>
              {note ? `Editar ${noteKindLabels[note.kind].toLowerCase()}` : "Nova anotação"}
            </DialogTitle>
            <DialogDescription>
              {note
                ? "Atualize o conteúdo e os itens já registrados."
                : "Escolha o tipo e preencha o que precisa acompanhar."}
            </DialogDescription>
          </DialogHeader>
          <NoteForm
            key={note?.id ?? "new-note"}
            note={note}
            onAttachmentsBusyChange={setAttachmentsBusy}
            onCancel={() => requestOpenChange(false)}
            onPendingFilesChange={setPendingFiles}
            onSubmit={submit}
            pendingFiles={pendingFiles}
            ref={formRef}
          />
        </DialogContent>
      </Dialog>

      <AlertDialog onOpenChange={setDiscardOpen} open={discardOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Descartar alterações?</AlertDialogTitle>
            <AlertDialogDescription>
              O conteúdo ainda não salvo será perdido.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Continuar editando</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setDiscardOpen(false);
                onOpenChange(false);
              }}
              variant="destructive"
            >
              Descartar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
