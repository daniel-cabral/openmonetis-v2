import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  useDetachNoteAttachmentMutation,
  useUploadNoteAttachmentMutation,
} from "../attachments.mutations";
import { formatAttachmentUploadResult } from "../attachments.presentation";
import { noteAttachmentsQueryOptions } from "../attachments.queries";
import { AttachmentList } from "./attachment-list";

type NoteAttachmentsProps = {
  noteId: string;
  readOnly?: boolean;
  canAdd?: boolean;
  onBusyChange?: (busy: boolean) => void;
};

export function NoteAttachments({
  noteId,
  readOnly = false,
  canAdd = true,
  onBusyChange,
}: NoteAttachmentsProps) {
  const query = useQuery(noteAttachmentsQueryOptions(noteId));
  const upload = useUploadNoteAttachmentMutation(noteId);
  const detach = useDetachNoteAttachmentMutation(noteId);

  return (
    <AttachmentList
      attachments={query.data}
      canAdd={canAdd}
      isError={query.isError}
      isLoading={query.isLoading}
      onBusyChange={onBusyChange}
      onDetach={async (attachment) => {
        await detach.mutateAsync(attachment.id);
        toast.success("Anexo removido.");
      }}
      onRetry={() => void query.refetch()}
      onUpload={async (file) => {
        await upload.mutateAsync(file);
        toast.success(formatAttachmentUploadResult(1));
      }}
      readOnly={readOnly}
    />
  );
}
