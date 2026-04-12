import { useLocation, Link } from "react-router-dom";
import { Home, BookOpen, Layers, FileText, User, Trophy, Target } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { path: "/", label: "Início", icon: Home },
  { path: "/questoes", label: "Questões", icon: BookOpen },
  { path: "/flashcards", label: "Cards", icon: Layers },
  { path: "/mentoria", label: "Mentoria", icon: Target },
  { path: "/resumos", label: "Resumos", icon: FileText },
  { path: "/ranking", label: "Ranking", icon: Trophy },
  { path: "/perfil", label: "Perfil", icon: User },
];

export function BottomNav() {
  const { pathname } = useLocation();

  if (pathname === "/login") return null;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card/95 backdrop-blur-lg safe-bottom">
      <div className="mx-auto flex max-w-lg items-center justify-around px-1 py-1">
        {navItems.map((item) => {
          const active = pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                "flex flex-col items-center gap-0.5 rounded-xl px-1 sm:px-2 py-1 transition-all",
                active
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <item.icon
                className={cn(
                  "h-5 w-5 transition-all",
                  active && "scale-110"
                )}
                strokeWidth={active ? 2.5 : 2}
              />
              <span className="text-[10px] sm:text-xs font-semibold">{item.label}</span>
              {active && (
                <span className="mt-0.5 h-1 w-1 rounded-full bg-primary" />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
