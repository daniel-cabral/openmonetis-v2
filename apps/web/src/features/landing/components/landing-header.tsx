import { Link } from "@tanstack/react-router";
import { Menu, Moon, Sun } from "lucide-react";
import { useState } from "react";
import { OpenMonetisLogo } from "@/components/openmonetis-logo";
import { useTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { landingNavLinks } from "@/features/landing/landing.presentation";

type LandingHeaderProps = {
  signupEnabled: boolean;
};

export function LandingHeader({ signupEnabled }: LandingHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-10 border-border border-b bg-background/85 backdrop-blur-md">
      <div className="project-container px-4 flex h-14 items-center justify-between gap-4">
        <Link to="/">
          <OpenMonetisLogo />
        </Link>
        <nav
          aria-label="Seções da página"
          className="hidden gap-6 text-muted-foreground text-sm md:flex"
        >
          {landingNavLinks.map((link) => (
            <a key={link.href} className="hover:text-foreground" href={link.href}>
              {link.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <LandingThemeToggle />
          <div className="hidden items-center gap-2 md:flex">
            <AuthActions signupEnabled={signupEnabled} />
          </div>
          <Sheet onOpenChange={setMenuOpen} open={menuOpen}>
            <SheetTrigger
              aria-label="Abrir menu"
              render={<Button className="md:hidden" size="icon-sm" type="button" variant="ghost" />}
            >
              <Menu aria-hidden="true" className="size-4.5" />
            </SheetTrigger>
            <SheetContent side="right">
              <SheetHeader>
                <SheetTitle>Menu</SheetTitle>
              </SheetHeader>
              <SheetBody>
                <nav aria-label="Menu de seções" className="grid gap-3">
                  {landingNavLinks.map((link) => (
                    <a
                      key={link.href}
                      className="text-foreground text-base"
                      href={link.href}
                      onClick={() => setMenuOpen(false)}
                    >
                      {link.label}
                    </a>
                  ))}
                </nav>
                <div className="mt-6 grid gap-2">
                  <AuthActions
                    fullWidth
                    onNavigate={() => setMenuOpen(false)}
                    signupEnabled={signupEnabled}
                  />
                </div>
              </SheetBody>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}

type AuthActionsProps = {
  signupEnabled: boolean;
  fullWidth?: boolean;
  onNavigate?: () => void;
};

function LandingThemeToggle() {
  const { setTheme } = useTheme();

  function toggleTheme() {
    const isDark = document.documentElement.classList.contains("dark");
    setTheme(isDark ? "light" : "dark");
  }

  return (
    <Button
      aria-label="Alternar tema"
      className="relative text-muted-foreground hover:bg-muted hover:text-foreground"
      onClick={toggleTheme}
      size="icon-sm"
      type="button"
      variant="ghost"
    >
      <Sun
        aria-hidden="true"
        className="absolute size-4.5 scale-100 rotate-0 transition-transform dark:scale-0 dark:-rotate-90"
      />
      <Moon
        aria-hidden="true"
        className="absolute size-4.5 scale-0 rotate-90 transition-transform dark:scale-100 dark:rotate-0"
      />
    </Button>
  );
}

function AuthActions({ signupEnabled, fullWidth = false, onNavigate }: AuthActionsProps) {
  const className = fullWidth ? "w-full" : undefined;

  return (
    <>
      <Button asChild className={className} variant="ghost">
        <Link onClick={onNavigate} to="/login">
          Entrar
        </Link>
      </Button>
      {signupEnabled ? (
        <Button asChild className={className}>
          <Link onClick={onNavigate} to="/signup">
            Criar conta
          </Link>
        </Button>
      ) : null}
    </>
  );
}
