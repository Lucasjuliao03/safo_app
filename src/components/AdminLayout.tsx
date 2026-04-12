import { ReactNode, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { LayoutDashboard, Users, Layers, BookOpen, FileText, MessageSquare, Bell, LogOut, Menu, X, Shield, Copy } from "lucide-react";
import { cn } from "@/lib/utils";
import { logout } from "@/services/authService";

interface AdminLayoutProps {
  children: ReactNode;
}

const navItems = [
  { path: "/painel", label: "Dashboard", icon: LayoutDashboard },
  { path: "/painel/usuarios", label: "Usuários", icon: Users },
  { path: "/painel/estrutura", label: "Cursos & Estrutura", icon: Layers },
  { path: "/painel/questoes", label: "Questões", icon: BookOpen },
  { path: "/painel/conteudo", label: "Flashcards e Resumos", icon: FileText },
  { path: "/painel/planos", label: "Planos", icon: Copy },
  { path: "/painel/mensagens", label: "Mensagens & Avisos", icon: MessageSquare },
  { path: "/painel/push", label: "Push Notifications", icon: Bell },
];

export function AdminLayout({ children }: AdminLayoutProps) {
  const { pathname } = useLocation();
  const { user } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    window.location.href = "/login";
  };

  const SidebarContent = () => (
    <div className="flex flex-col h-full bg-card border-r border-border w-64">
      <div className="p-6">
        <div className="flex items-center gap-2 mb-2">
          <div className="p-1.5 rounded-lg bg-primary/10 border border-primary/20">
            <Shield className="h-5 w-5 text-primary" />
          </div>
          <h1 className="text-xl font-black text-foreground">SAFO Admin</h1>
        </div>
        <p className="text-xs text-muted-foreground ml-1">v2.0 — Painel Gestor</p>
      </div>

      <nav className="flex-1 px-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const active = pathname === item.path || (item.path !== "/painel" && pathname.startsWith(item.path));
          return (
            <Link
              key={item.path}
              to={item.path}
              onClick={() => setMobileMenuOpen(false)}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all group",
                active
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <item.icon
                className={cn("h-4 w-4 transition-all", active ? "text-primary" : "text-muted-foreground group-hover:text-foreground")}
              />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-border mt-auto">
        <div className="flex items-center gap-3 px-3 py-2 mb-2">
          <div className="h-8 w-8 rounded-full bg-secondary text-secondary-foreground flex items-center justify-center font-bold text-xs uppercase">
            {user?.name?.slice(0, 2) || "AD"}
          </div>
          <div className="overflow-hidden">
            <p className="text-sm font-semibold truncate text-foreground">{user?.name}</p>
            <p className="text-[10px] text-muted-foreground truncate">{user?.email}</p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold rounded-lg bg-destructive/10 text-destructive hover:bg-destructive hover:text-destructive-foreground transition-all"
        >
          <LogOut className="h-3.5 w-3.5" /> Sair do Painel
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background text-foreground flex">
      {/* Desktop Sidebar */}
      <div className="hidden md:block w-64 shrink-0">
        <div className="fixed inset-y-0 w-64">
          <SidebarContent />
        </div>
      </div>

      {/* Mobile Topbar & Menu */}
      <div className="block md:hidden fixed top-0 w-full z-40 bg-card border-b border-border p-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-bold">SAFO Admin</h1>
        </div>
        <button className="p-2" onClick={() => setMobileMenuOpen(true)}>
          <Menu className="h-5 w-5" />
        </button>
      </div>

      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="fixed inset-0 bg-background/80 backdrop-blur-sm" onClick={() => setMobileMenuOpen(false)} />
          <div className="relative z-50 w-64 h-full bg-card shadow-xl flex flex-col animate-slide-right">
            <button className="absolute top-4 right-4 p-2 text-muted-foreground" onClick={() => setMobileMenuOpen(false)}>
              <X className="h-5 w-5" />
            </button>
            <SidebarContent />
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 md:pl-0 pt-[72px] md:pt-0 min-w-0">
        <div className="max-w-6xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
