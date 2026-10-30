import { supabase } from "@/lib/supabase";
import { User, UserRole } from "@/types/study";

export async function fetchProfile(userId: string): Promise<User | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single();

  if (error || !data) return null;

  let courseId = data.course_id;

  // Se course_id está vazio no perfil, tenta pegar do user_metadata e salvar
  if (!courseId) {
    const { data: authData } = await supabase.auth.getUser();
    const metaCourseId = authData?.user?.user_metadata?.course_id;
    if (metaCourseId) {
      courseId = parseInt(String(metaCourseId));
      // Tenta salvar no perfil (pode falhar por RLS, mas tenta)
      await supabase.from("profiles").update({ course_id: courseId }).eq("id", userId);
    }
  }

  return {
    id: data.id,
    name: data.full_name,
    email: data.username || "user@example.com",
    role: data.role as UserRole,
    isApproved: data.is_active,
    accessBlocked: data.access_blocked === true,
    createdAt: data.created_at,
    courseId: courseId,
    editalId: data.edital_id,
    activeUntil: data.active_until,
    passwordHash: "",
  };
}

export async function login(
  email: string,
  password: string
): Promise<{ success: boolean; error?: string; user?: User }> {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    let msg = "Email ou senha inválidos.";
    if (error.message.includes("Invalid login")) msg = "Credenciais inválidas. Verifique se você confirmou seu e-mail.";
    return { success: false, error: msg };
  }

  if (data.user) {
    const profile = await fetchProfile(data.user.id);
    if (profile) return { success: true, user: profile };
    
    // Fallback if the database trigger didn't run properly
    return { 
      success: true, 
      user: {
        id: data.user.id,
        name: data.user.user_metadata?.full_name || email.split("@")[0],
        email: email,
        role: "student",
        isApproved: false,
        createdAt: data.user.created_at,
        passwordHash: "",
      } 
    };
  }
  return { success: true };
}

export async function register(
  name: string,
  email: string,
  password: string,
  courseId?: number
): Promise<{ success: boolean; error?: string; user?: User }> {
  if (password.length < 6) {
    return { success: false, error: "A senha deve ter no mínimo 6 caracteres." };
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: name,
        course_id: courseId,
      },
    },
  });

  if (error) {
    let msg = error.message;
    if (msg.toLowerCase().includes("rate limit")) {
      msg = "Muitas tentativas. Tente novamente mais tarde.";
    } else if (msg.includes("already registered")) {
      msg = "E-mail já está em uso.";
    }
    return { success: false, error: msg };
  }

  // Tenta salvar course_id no perfil (pode falhar por RLS se não há sessão)
  if (data.user && courseId) {
    await new Promise(r => setTimeout(r, 1000));
    await supabase.from("profiles").update({ course_id: courseId }).eq("id", data.user.id);
  }

  if (!data.session) {
    return { success: false, error: "Cadastro realizado! Verifique seu e-mail para confirmar a conta antes de entrar." };
  }

  return { success: true };
}

export async function logout(): Promise<void> {
  await supabase.auth.signOut();
}

export function getCurrentUser(): User | null {
  // Synchronous getter is deprecated when using Supabase,
  // rely on AuthContext for current user instead.
  return null;
}

export async function getAllUsers(): Promise<User[]> {
  const { data, error } = await supabase.from("profiles").select("*");
  if (error || !data) return [];
  return data.map((d) => ({
    id: d.id,
    name: d.full_name,
    email: d.username || "",
    role: d.role as UserRole,
    isApproved: d.is_active,
    accessBlocked: d.access_blocked === true,
    createdAt: d.created_at,
    courseId: d.course_id,
    activeUntil: d.active_until,
    passwordHash: "",
  }));
}

export async function approveUser(userId: string, activeUntil?: string | null): Promise<void> {
  const payload: any = { is_active: true, access_blocked: false };
  if (activeUntil !== undefined) {
    payload.active_until = activeUntil;
  }
  const { error } = await supabase.from("profiles").update(payload).eq("id", userId);
  if (error) throw error;
}

export async function blockUser(userId: string): Promise<void> {
  const { error } = await supabase.from("profiles").update({ is_active: false, access_blocked: true }).eq("id", userId);
  if (error) throw error;
}

export async function deleteUser(userId: string): Promise<void> {
  // Remove o perfil do banco (cascade vai limpar dados vinculados)
  await supabase.from("profiles").delete().eq("id", userId);
}
