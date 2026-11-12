import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { useDetachAttachmentMutation, useUploadAttachmentMutation } from "../attachments.mutations";
import { transactionAttachmentsQueryOptions } from "../attachments.queries";
import { AttachmentList } from "./attachment-list";

type TransactionAttachmentsProps = {
  transactionId: string;
  onBusyChange?: (busy: boolean) => void;
  readOnly?: boolean;
};

export function TransactionAttachments({
  transactionId,
  onBusyChange,
  readOnly = false,
}: TransactionAttachmentsProps) {
  const query = useQuery(transactionAttachmentsQueryOptions(transactionId));
  const upload = useUploadAttachmentMutation(transactionId);
  const detach = useDetachAttachmentMutation(transactionId);

  return (
    <AttachmentList
      attachments={query.data}
      isError={query.isError}
      isLoading={query.isLoading}
      onBusyChange={onBusyChange}
      onDetach={async (attachment) => {
        await detach.mutateAsync(attachment.id);
        toast.success("Anexo removido do lançamento");
      }}
      onRetry={() => void query.refetch()}
      onUpload={async (file) => {
        await upload.mutateAsync(file);
        toast.success("Anexo enviado");
      }}
      readOnly={readOnly}
    />
  );
}
