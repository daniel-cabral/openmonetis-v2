import {
  findOverlappingTrip,
  tripNameMaxLength,
  tripNoteMaxLength,
} from "@openmonetis/domain/trips";
import { dateOnlyToSafeInstant, formatDateInBrazil } from "@openmonetis/shared/date-time";
import type { TripListItemOutput } from "@openmonetis/validators/trips";
import { ApiClientError } from "../../lib/api-client";

type TripPeriodDraft = { id?: string; startDate: string; endDate: string };

function formatTripDate(date: string) {
  return formatDateInBrazil(dateOnlyToSafeInstant(date), {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function formatTripPeriod(period: { startDate: string; endDate: string }) {
  return `${formatTripDate(period.startDate)} a ${formatTripDate(period.endDate)}`;
}

export function formatLinkedCount(count: number) {
  return count === 1 ? "1 lançamento" : `${count.toLocaleString("pt-BR")} lançamentos`;
}

export function getTripErrorMessage(
  error: unknown,
  trips: readonly TripListItemOutput[],
  draft: TripPeriodDraft,
) {
  if (error instanceof ApiClientError) {
    if (error.code === "TRIP_OVERLAP") {
      const overlap = findOverlappingTrip(draft, trips);
      if (overlap) {
        return `As datas se sobrepõem à viagem "${overlap.name}" (${formatTripPeriod(overlap)}).`;
      }
    }
    if (error.code === "TRIP_NOT_FOUND") return "Viagem não encontrada.";
    if (error.code === "TRIP_NOT_LINKABLE") {
      return "Este lançamento não pode ser vinculado a uma viagem.";
    }
  }
  return "Não foi possível salvar a viagem.";
}

export const tripFormMessages = {
  nameRequired: "Informe o nome da viagem.",
  nameTooLong: `O nome deve ter no máximo ${tripNameMaxLength} caracteres.`,
  startDateInvalid: "Informe uma data de início válida.",
  endDateInvalid: "Informe uma data de fim válida.",
  endBeforeStart: "A data de fim deve ser igual ou posterior à data de início.",
  noteTooLong: `A anotação deve ter no máximo ${tripNoteMaxLength} caracteres.`,
} as const;
