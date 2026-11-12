import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { landingLinks, landingQuickStartTabs } from "@/features/landing/landing.presentation";

export function LandingQuickStart() {
  return (
    <div className="mx-auto mt-10 max-w-3xl">
      <Tabs defaultValue="installer">
        <TabsList>
          {landingQuickStartTabs.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {landingQuickStartTabs.map((tab) => (
          <TabsContent key={tab.value} className="mt-6" value={tab.value}>
            <ol className="grid gap-6">
              {tab.steps.map((step) => (
                <li key={step.title} className="grid min-w-0 gap-2">
                  <h3 className="font-medium">{step.title}</h3>
                  {step.commands.map((command) => (
                    <pre
                      key={command}
                      className="max-w-full overflow-x-auto rounded-lg bg-muted p-4 font-mono text-sm"
                    >
                      <code>{command}</code>
                    </pre>
                  ))}
                  {step.note ? <p className="text-muted-foreground text-sm">{step.note}</p> : null}
                </li>
              ))}
            </ol>
          </TabsContent>
        ))}
      </Tabs>
      <p className="mt-8 text-center">
        <a
          className="font-medium text-brand-strong hover:underline"
          href={landingLinks.docs}
          rel="noopener noreferrer"
          target="_blank"
        >
          Ver documentação completa
        </a>
      </p>
    </div>
  );
}
