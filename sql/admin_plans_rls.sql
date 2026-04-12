-- ============================================================
-- SQL para habilitar CRUD de Planos pelo Painel de Admin
-- Execute no SQL Editor do Supabase
-- ============================================================

-- 1. Cria a função auxiliar para verificar se o usuário atual é admin
CREATE OR REPLACE FUNCTION public.is_admin_user()
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_role text;
BEGIN
  SELECT role INTO v_role
  FROM public.profiles
  WHERE id = auth.uid();
  
  RETURN coalesce(v_role = 'admin', false);
END;
$$;

-- 2. Atualizar as políticas da tabela plans
-- Qualquer um pode ler os planos ativos (já existente, recreando para garantir clareza)
DROP POLICY IF EXISTS "plans_read" ON public.plans;
CREATE POLICY "plans_read"
  ON public.plans FOR SELECT
  USING (is_active = true OR public.is_admin_user());

-- Admins podem Inserir
DROP POLICY IF EXISTS "plans_admin_insert" ON public.plans;
CREATE POLICY "plans_admin_insert"
  ON public.plans FOR INSERT
  WITH CHECK (public.is_admin_user());

-- Admins podem Atualizar
DROP POLICY IF EXISTS "plans_admin_update" ON public.plans;
CREATE POLICY "plans_admin_update"
  ON public.plans FOR UPDATE
  USING (public.is_admin_user());

-- Admins poderiam deletar (embora recomendemos só desativar)
DROP POLICY IF EXISTS "plans_admin_delete" ON public.plans;
CREATE POLICY "plans_admin_delete"
  ON public.plans FOR DELETE
  USING (public.is_admin_user());
