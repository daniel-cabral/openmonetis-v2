import type { CategoryTrendsOutput } from "@openmonetis/validators/category-trends";
import { Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  getCategoryLabel,
  sortCategoryOptions,
} from "@/features/categories/categories.presentation";
import { CategoryIcon } from "@/features/categories/category-icons";
import { categoryHistoryMaxSelection } from "../category-trends.presentation";

type AvailableCategory = CategoryTrendsOutput["availableCategories"][number];

const typeGroups = [
  { type: "expense", heading: "Despesas" },
  { type: "income", heading: "Receitas" },
] as const;

export function CategoryHistoryPicker({
  availableCategories,
  onSelect,
  selectedIds,
}: {
  availableCategories: AvailableCategory[];
  onSelect: (categoryId: string) => void;
  selectedIds: readonly string[];
}) {
  const [open, setOpen] = useState(false);
  const isFull = selectedIds.length >= categoryHistoryMaxSelection;
  const options = availableCategories.filter(
    (category) => !selectedIds.includes(category.categoryId),
  );

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger
        render={<Button disabled={isFull} size="sm" type="button" variant="outline" />}
      >
        <Plus aria-hidden="true" data-icon="inline-start" />
        Adicionar categoria
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-0">
        <Command>
          <CommandInput aria-label="Buscar categoria" placeholder="Buscar categoria" />
          <CommandList>
            <CommandEmpty>Nenhuma categoria encontrada.</CommandEmpty>
            {typeGroups.map((group) => {
              const categories = sortCategoryOptions(
                options.filter((category) => category.type === group.type),
              );
              if (categories.length === 0) return null;

              return (
                <CommandGroup heading={group.heading} key={group.type}>
                  {categories.map((category) => (
                    <CommandItem
                      key={category.categoryId}
                      onSelect={() => {
                        setOpen(false);
                        onSelect(category.categoryId);
                      }}
                      value={`${getCategoryLabel(category)} ${category.categoryId}`}
                    >
                      <CategoryIcon aria-hidden="true" className="size-4" name={category.icon} />
                      <span className="truncate">{getCategoryLabel(category)}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              );
            })}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
