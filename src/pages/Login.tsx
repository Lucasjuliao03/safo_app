import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { BookOpen, Lock, Mail, User, Eye, EyeOff, ChevronRight, GraduationCap } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCourses } from "@/hooks/useStudyData";

export default function LoginPage() {
  const [isRegister, setIsRegister] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState("");

  const { login, register, isAuthenticated, loading } = useAuth();
  const { data: courses = [] } = useCourses();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const requestedReturn = params.get('returnTo') ?? '';
  const returnTo = /^\/pagamento\/(sucesso|pendente|falhou)(?:\?|$)/.test(requestedReturn) ? requestedReturn : '/';

  // If already logged in, redirect away
  useEffect(() => {
    if (isAuthenticated && !loading) {
      navigate(returnTo, { replace: true });
    }
  }, [isAuthenticated, loading, navigate, returnTo]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    
    setError("");
    setIsSubmitting(true);

    try {
      let result;
      if (isRegister) {
        if (!name.trim()) { setError("Informe seu nome."); setIsSubmitting(false); return; }
        if (!selectedCourse) { setError("Escolha um curso preparatório."); setIsSubmitting(false); return; }
        result = await register(name.trim(), email.trim(), password, parseInt(selectedCourse));
      } else {
        result = await login(email.trim(), password);
      }

      if (result.success) {
        navigate(returnTo, { replace: true });
      } else {
        setError(result.error || "Erro ao processar. Tente novamente.");
      }
    } catch {
      setError("Erro inesperado. Tente novamente.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="dark min-h-screen bg-background flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm space-y-8 animate-slide-up">
        {/* Logo */}
        <div className="text-center space-y-3">
          <div className="mx-auto flex items-center justify-center p-2 h-24 w-24 rounded-2xl bg-secondary/15 border border-secondary/25">
            <img src="/logo.png" alt="SAFO Logo" className="w-[110%] h-[110%] object-contain scale-[1.3]" />
          </div>
          <div>
            <h1 className="text-3xl font-black text-foreground">SAFO</h1>
            <p className="text-sm text-muted-foreground mt-1">Sua preparação para concursos</p>
          </div>
        </div>

        {/* Toggle */}
        <div className="flex rounded-xl bg-muted p-1">
          <button
            onClick={() => { setIsRegister(false); setError(""); }}
            className={cn(
              "flex-1 rounded-lg py-2.5 text-sm font-semibold transition-all",
              !isRegister ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground"
            )}
          >
            Entrar
          </button>
          <button
            onClick={() => { setIsRegister(true); setError(""); }}
            className={cn(
              "flex-1 rounded-lg py-2.5 text-sm font-semibold transition-all",
              isRegister ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground"
            )}
          >
            Cadastrar
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {isRegister && (
            <>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Nome completo</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Seu nome"
                    className="w-full rounded-xl border border-border bg-card pl-10 pr-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Curso Preparatório</label>
                <div className="relative">
                  <GraduationCap className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <select
                    value={selectedCourse}
                    onChange={(e) => setSelectedCourse(e.target.value)}
                    className="w-full rounded-xl border border-border bg-card pl-10 pr-4 py-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all appearance-none"
                  >
                    <option value="" disabled>Selecione seu curso...</option>
                    {courses.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            </>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Email</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu@email.com"
                required
                className="w-full rounded-xl border border-border bg-card pl-10 pr-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Senha</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••"
                required
                className="w-full rounded-xl border border-border bg-card pl-10 pr-10 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {error && (
            <div className="rounded-xl bg-destructive/10 border border-destructive/30 px-4 py-2.5">
              <p className="text-xs text-destructive font-medium">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className={cn(
              "w-full flex items-center justify-center gap-2 rounded-xl py-3.5 font-semibold text-sm transition-all",
              isSubmitting
                ? "bg-muted text-muted-foreground cursor-not-allowed"
                : "bg-primary text-primary-foreground active:scale-[0.98]"
            )}
          >
            {isSubmitting ? (
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-foreground" />
            ) : (
              <>
                {isRegister ? "Criar Conta" : "Entrar"}
                <ChevronRight className="h-4 w-4" />
              </>
            )}
          </button>
        </form>

        {isRegister && (
          <p className="text-xs text-center text-muted-foreground leading-relaxed">
            Ao se cadastrar, você terá acesso a <span className="font-bold text-foreground">10 questões gratuitas</span>.
            Após isso, seu acesso será liberado pelo administrador.
          </p>
        )}
      </div>
    </div>
  );
}
