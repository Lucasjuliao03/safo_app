import { useLocation, Link } from "react-router-dom";
import { Home, BookOpen, Layers, FileText, User, Trophy, Target, Map } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAccessStatus } from '@/hooks/useAccessStatus';

const navItems = [
  { path: "/", label: "Início", icon: Home },
  { path: "/estudos", label: "Estudos", icon: BookOpen },
  { path: "/patrulhamento", label: "Patrulha", icon: Map },
  { path: "/mentoria", label: "Mentoria", icon: Target },
  { path: "/ranking", label: "Ranking", icon: Trophy },
  { path: "/perfil", label: "Perfil", icon: User },
];

export function BottomNav() {
  const { pathname } = useLocation();
  const { canAccess } = useAccessStatus();
  const visibleItems = canAccess ? navItems : navItems.filter(item => item.path === '/perfil');

  if (pathname === "/login") return null;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card/95 backdrop-blur-lg safe-bottom">
      <div className="mx-auto flex max-w-lg items-center justify-around px-1 py-1">
        {visibleItems.map((item) => {
          const active = pathname === item.path || (item.path === '/estudos' && ['/questoes', '/flashcards', '/resumos'].includes(pathname));
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
