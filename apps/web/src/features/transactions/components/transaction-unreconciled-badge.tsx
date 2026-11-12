import { Link2Off } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const unreconciledPaidLabel = "Pago, mas não conciliado com o extrato";

export function TransactionUnreconciledBadge() {
  return (
    <Tooltip>
      <TooltipTrigger render={<span className="inline-flex" />}>
        <Link2Off aria-hidden="true" className="size-4 text-warning" />
        <span className="sr-only">{unreconciledPaidLabel}</span>
      </TooltipTrigger>
      <TooltipContent>{unreconciledPaidLabel}</TooltipContent>
    </Tooltip>
  );
}
