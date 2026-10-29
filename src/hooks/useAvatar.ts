// useAvatar.ts - Hook para gerenciar avatar do usuário

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

// ============================================================
// TIPOS
// ============================================================

interface AvatarManifest {
  name: string;
  ext: string;
}

// ============================================================
// CARREGAR MANIFEST E CONSTRUIR MAPA
// ============================================================

let avatarMap: Record<string, string> = {};
let loadedManifest: AvatarManifest[] = [];

// Função para carregar o manifest e construir o mapa
async function loadManifest(): Promise<AvatarManifest[]> {
  try {
    // Adicionar timestamp para evitar cache em desenvolvimento
    const timestamp = Date.now();
    const response = await fetch(`/avatar/manifest.json?t=${timestamp}`);
    if (!response.ok) {
      console.warn('[useAvatar] Manifest não encontrado, usando fallback');
      return getFallbackManifest();
    }
    
    const manifest: AvatarManifest[] = await response.json();
    loadedManifest = manifest;
    
    // Construir mapa: name -> /avatar/name.ext
    avatarMap = {};
    for (const item of manifest) {
      avatarMap[item.name] = `/avatar/${item.name}.${item.ext}`;
    }
    
    return manifest;
  } catch (error) {
    console.error('[useAvatar] Erro ao carregar manifest:', error);
    return getFallbackManifest();
  }
}

// Fallback caso manifest não seja encontrado
function getFallbackManifest(): AvatarManifest[] {
  avatarMap = {
    default: '/avatar/default.svg'
  };
  return [{ name: 'default', ext: 'svg' }];
}

// ============================================================
// FUNÇÕES EXPORTADAS
// ============================================================

// Lista de avatares disponíveis (inicialmente vazia, carrega do manifest)
export let AVAILABLE_AVATARS: string[] = [];

// Lista para compatibilidade
export let DEFAULT_AVATARS: string[] = [];

// Lista fixa para referência
export const KNOWN_AVATARS: string[] = [];

// Função para carregar avatares (assíncrono)
export async function loadAvailableAvatars(): Promise<string[]> {
  const manifest = await loadManifest();
  AVAILABLE_AVATARS = manifest.map(m => m.name);
  DEFAULT_AVATARS = [...AVAILABLE_AVATARS];
  // Precarregar as primeiras 10 imagens de avatar em background
  if (manifest.length > 0) {
    const avatarsToPreload = manifest.slice(0, 10).map(m => avatarMap[m.name]);
    Promise.all(avatarsToPreload.map(src => {
      if (src) {
        const img = new Image();
        img.src = src;
      }
    })).catch(() => {});
  }
  
  return AVAILABLE_AVATARS;
}

// Função para validar se avatar existe
export function validateAvatar(avatar: string | null): string {
  if (!avatar) return 'default';
  const lower = avatar.toLowerCase();
  if (AVAILABLE_AVATARS.includes(lower)) {
    return lower;
  }
  // Verificar case-insensitive
  const found = AVAILABLE_AVATARS.find(a => a.toLowerCase() === lower);
  if (found) return found;
  return 'default';
}

// Função para obter URL do avatar
export function getAvatarUrl(avatar: string | null): string {
  const validated = validateAvatar(avatar);
  return avatarMap[validated] || avatarMap['default'] || '/avatar/default.svg';
}

// Versão síncrona
export function getAvatarUrlSync(avatar: string | null): string {
  return getAvatarUrl(avatar);
}

// ============================================================
// HOOKS
// ============================================================

// Hook para buscar avatar atual do usuário
export function useUserAvatar(userId: string | undefined) {
  return useQuery({
    queryKey: ['userAvatar', userId],
    queryFn: async () => {
      if (!userId) return null;
      
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('avatar')
          .eq('id', userId)
          .single();
        
        if (error) {
          console.error('[useUserAvatar] Error:', error);
          return 'default';
        }
        
        return validateAvatar(data?.avatar);
      } catch (err) {
        console.error('[useUserAvatar] Exception:', err);
        return 'default';
      }
    },
    enabled: !!userId,
    staleTime: 1000 * 60 * 5,
    retry: 2,
    retryDelay: (attemptIndex) => Math.min(1000 * Math.pow(2, attemptIndex), 8000),
  });
}

// Hook para atualizar avatar
export function useUpdateAvatar() {
  const qc = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ userId, avatar }: { userId: string; avatar: string }) => {
      const validatedAvatar = validateAvatar(avatar);
      
      const { error } = await supabase
        .from('profiles')
        .update({ avatar: validatedAvatar })
        .eq('id', userId);
      
      if (error) {
        throw new Error(error.message);
      }
      
      return { avatar: validatedAvatar };
    },
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ['userAvatar', variables.userId] });
      qc.invalidateQueries({ queryKey: ['userProfile', variables.userId] });
    },
    retry: 2,
    retryDelay: (attemptIndex) => Math.min(1000 * Math.pow(2, attemptIndex), 8000),
  });
}

// Hook para listar avatares disponíveis
export function useAvailableAvatars() {
  return useQuery({
    queryKey: ['availableAvatars'],
    queryFn: async () => {
      // Se ainda não carregou, carrega agora
      if (AVAILABLE_AVATARS.length === 0) {
        return loadAvailableAvatars();
      }
      return AVAILABLE_AVATARS;
    },
    staleTime: 1000 * 60 * 60, // 1 hora
  });
}
