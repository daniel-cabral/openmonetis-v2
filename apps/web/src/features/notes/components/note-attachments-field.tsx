import type { NoteOutput } from "@openmonetis/validators/notes";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AttachmentFilePicker } from "@/features/attachments/components/attachment-file-picker";
import { NoteAttachments } from "@/features/attachments/components/note-attachments";
import { userPreferencesQueryOptions } from "@/features/preferences/preferences.queries";

type NoteAttachmentsFieldProps = {
  note?: NoteOutput | null;
  canAdd: boolean;
  pendingFiles: File[];
  onPendingFilesChange: (files: File[]) => void;
  onBusyChange: (busy: boolean) => void;
};

export function NoteAttachmentsField({
  note,
  canAdd,
  pendingFiles,
  onPendingFilesChange,
  onBusyChange,
}: NoteAttachmentsFieldProps) {
  const preferences = useQuery(userPreferencesQueryOptions());

  return (
    <div className="grid gap-2">
      <span className="font-medium text-sm">Anexos</span>
      {note ? (
        <NoteAttachments canAdd={canAdd} noteId={note.id} onBusyChange={onBusyChange} />
      ) : (
        <>
          {pendingFiles.map((file, index) => (
            <div
              className="flex items-center justify-between gap-2 rounded-lg border p-2"
              key={`${file.name}-${file.size}-${file.lastModified}`}
            >
              <span className="min-w-0 truncate text-sm">{file.name}</span>
              <Button
                aria-label={`Remover ${file.name}`}
                onClick={() =>
                  onPendingFilesChange(pendingFiles.filter((_, position) => position !== index))
                }
                size="icon-sm"
                type="button"
                variant="ghost"
              >
                <X aria-hidden="true" />
              </Button>
            </div>
          ))}
          {canAdd ? (
            <AttachmentFilePicker
              maxSizeMb={preferences.data?.attachmentMaxSizeMb}
              onAdd={(file) => onPendingFilesChange([...pendingFiles, file])}
            />
          ) : null}
        </>
      )}
    </div>
  );
}
