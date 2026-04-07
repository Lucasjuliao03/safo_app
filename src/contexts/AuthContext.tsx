import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { User } from "@/types/study";
import * as authService from "@/services/authService";
import { supabase } from "@/lib/supabase";
import { loadAvailableAvatars } from "@/hooks/useAvatar";

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isApproved: boolean;
  loading: boolean;
  login: typeof authService.login;
  register: typeof authService.register;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = async (userId?: string) => {
    try {
      if (!userId) {
        const { data } = await supabase.auth.getUser();
        userId = data.user?.id;
      }
      if (userId) {
        const profile = await authService.fetchProfile(userId);
        setUser(profile);
      } else {
        setUser(null);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    // Carregar avatares em background
    loadAvailableAvatars();
    
    // Initial fetch
    refreshUser().finally(() => setLoading(false));

    // Listen to changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        setUser(null);
        setLoading(false);
      } else if (event === "SIGNED_IN" || event === "INITIAL_SESSION") {
        // We do NOT block the auth event loop with awaits. We just trigger background refresh.
        // login() already handles setUser on sign in.
        if (session?.user && !user) {
          refreshUser(session.user.id);
        }
      }
    });

    return () => { subscription.unsubscribe(); };
  }, []);

  const login = async (email: string, password: string) => {
    const result = await authService.login(email, password);
    if (result.success && result.user) {
      setUser(result.user);
    }
    return { success: result.success, error: result.error };
  };

  const register = async (name: string, email: string, password: string, courseId?: number) => {
    const result = await authService.register(name, email, password, courseId);
    return { success: result.success, error: result.error };
  };

  const logout = async () => {
    await authService.logout();
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isAdmin: user?.role === "admin",
        isApproved: user?.isApproved ?? false,
        loading,
        login,
        register,
        logout,
        refreshUser: () => refreshUser(),
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
