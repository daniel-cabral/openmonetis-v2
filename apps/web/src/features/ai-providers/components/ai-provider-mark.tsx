import type { AiProvider } from "@openmonetis/domain/ai-providers";
import { Image } from "@unpic/react";
import { cn } from "@/lib/utils";
import { aiProviderLabels, aiProviderLogos } from "../ai-providers.presentation";

/** Provider brand mark; the logo swaps with the theme when it has variants. */
export function AiProviderMark({
  className,
  provider,
  size = 28,
}: {
  className?: string;
  provider: AiProvider;
  size?: number;
}) {
  const logo = aiProviderLogos[provider];
  if (!logo) {
    // API-key providers have no brand asset yet: a neutral initial stands in for the mark.
    return (
      <span
        aria-hidden="true"
        className={cn(
          "inline-flex shrink-0 items-center justify-center rounded-md bg-muted font-medium text-muted-foreground text-xs",
          className,
        )}
        style={{ width: size, height: size }}
      >
        {aiProviderLabels[provider].charAt(0)}
      </span>
    );
  }
  const themed = logo.light !== logo.dark;
  const imageProps = { alt: "", height: size, layout: "fixed", width: size } as const;

  return (
    <span aria-hidden="true" className={cn("inline-flex shrink-0", className)}>
      <Image
        {...imageProps}
        className={cn("object-contain", themed && "dark:hidden")}
        src={logo.light}
      />
      {themed ? (
        <Image {...imageProps} className="hidden object-contain dark:block" src={logo.dark} />
      ) : null}
    </span>
  );
}
