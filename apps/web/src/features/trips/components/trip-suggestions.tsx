import { dateOnlyToSafeInstant, formatDateInBrazil } from "@openmonetis/shared/date-time";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { MobileSelect as Select } from "@/components/forms/mobile-select";
import { MobileSelectContent as SelectContent } from "@/components/forms/mobile-select-content";
import { MoneyValue } from "@/components/money-value";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useLinkTripTransactionsMutation } from "../trips.mutations";
import {
  formatLinkSelectionLabel,
  formatSuggestionRange,
  tripSuggestionOriginLabels,
} from "../trips.presentation";
import { tripSuggestionsQueryOptions } from "../trips.queries";

function formatPurchaseDate(date: string) {
  return formatDateInBrazil(dateOnlyToSafeInstant(date), {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function TripSuggestions({ tripId }: { tripId: string }) {
  const [origin, setOrigin] = useState("all");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
  const query = useQuery(tripSuggestionsQueryOptions(tripId, { page, origin }));
  const link = useLinkTripTransactionsMutation();
  const data = query.data;
  const pageIds = data?.items.map((item) => item.id) ?? [];
  const selectedOnPage = pageIds.filter((id) => selected.has(id)).length;
  const allOnPage = pageIds.length > 0 && selectedOnPage === pageIds.length;
  const someOnPage = selectedOnPage > 0 && !allOnPage;
  const originOptions = [
    { value: "all", label: tripSuggestionOriginLabels.all },
    { value: "cards", label: tripSuggestionOriginLabels.cards },
    { value: "accounts", label: tripSuggestionOriginLabels.accounts },
    ...(data?.originOptions ?? []),
  ];
  const originLabel = originOptions.find((option) => option.value === origin)?.label;

  function changeOrigin(next: string) {
    setOrigin(next);
    setPage(1);
    setSelected(new Set());
  }

  function toggleRow(id: string, checked: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function togglePage(checked: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      for (const id of pageIds) {
        if (checked) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }

  function selectAllFiltered() {
    setSelected(new Set([...selected, ...(data?.filteredIds ?? [])]));
  }

  async function linkSelected() {
    try {
      await link.mutateAsync({ id: tripId, ids: [...selected] });
      setSelected(new Set());
      toast.success("Lançamentos vinculados à viagem.");
    } catch {
      toast.error("Não foi possível vincular os lançamentos.");
    }
  }

  return (
    <Card className="gap-4 p-4 sm:p-6">
      <CardHeader className="p-0">
        <CardTitle className="text-lg">Sugestões ({data?.total ?? 0})</CardTitle>
        <p className="text-muted-foreground text-sm">
          Lançamentos sem viagem com data da compra no período, de cartões e contas.
        </p>
      </CardHeader>
      <CardContent className="grid gap-4 p-0">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Select onValueChange={(value) => value && changeOrigin(value)} value={origin}>
            <SelectTrigger aria-label="Origem" className="w-full sm:w-64">
              <SelectValue>{originLabel}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {originOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            disabled={selected.size === 0 || link.isPending}
            onClick={() => void linkSelected()}
            type="button"
          >
            {formatLinkSelectionLabel(selected.size)}
          </Button>
        </div>
        {allOnPage && data && data.filteredIds.length > pageIds.length ? (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span>Os {pageIds.length} desta página estão selecionados.</span>
            <Button onClick={selectAllFiltered} size="sm" type="button" variant="link">
              Selecionar todos os {data.filteredIds.length} do filtro
            </Button>
          </div>
        ) : null}
        {query.isLoading ? <Skeleton className="h-40" /> : null}
        {query.isError ? (
          <p className="text-destructive text-sm" role="alert">
            Não foi possível carregar as sugestões.
          </p>
        ) : null}
        {data ? (
          data.items.length ? (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        aria-label="Selecionar a página"
                        checked={allOnPage}
                        indeterminate={someOnPage}
                        onCheckedChange={(checked) => togglePage(checked)}
                      />
                    </TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead>Origem</TableHead>
                    <TableHead>Categoria</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <Checkbox
                          aria-label={`Selecionar ${item.name}`}
                          checked={selected.has(item.id)}
                          onCheckedChange={(checked) => toggleRow(item.id, checked)}
                        />
                      </TableCell>
                      <TableCell>{formatPurchaseDate(item.purchaseDate)}</TableCell>
                      <TableCell>
                        <span className="inline-flex flex-wrap items-center gap-2">
                          {item.name}
                          {item.isRecurring ? <Badge variant="secondary">recorrente</Badge> : null}
                        </span>
                      </TableCell>
                      <TableCell>{item.cardName ?? item.accountName ?? ""}</TableCell>
                      <TableCell>{item.categoryName ?? ""}</TableCell>
                      <TableCell className="text-right">
                        <MoneyValue amount={item.amount} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="flex flex-col items-center justify-between gap-3 border-t pt-3 text-sm sm:flex-row">
                <span className="text-muted-foreground">
                  {formatSuggestionRange({ from: data.from, to: data.to, total: data.total })}
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    disabled={data.page <= 1}
                    onClick={() => setPage(data.page - 1)}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    Anterior
                  </Button>
                  <span className="text-muted-foreground">
                    Página {data.page} de {data.pageCount}
                  </span>
                  <Button
                    disabled={data.page >= data.pageCount}
                    onClick={() => setPage(data.page + 1)}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    Próxima
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <p className="text-muted-foreground text-sm">Nenhuma sugestão.</p>
          )
        ) : null}
      </CardContent>
    </Card>
  );
}
