export function formatEstablishmentPurchases(count: number) {
  if (count === 1) return "1 lançamento · total acumulado";
  return `${Intl.NumberFormat("pt-BR").format(count)} lançamentos · total acumulado`;
}

export function formatPurchaseDay(purchaseDate: string) {
  const [, month, day] = purchaseDate.split("-");
  return `${day}/${month}`;
}
