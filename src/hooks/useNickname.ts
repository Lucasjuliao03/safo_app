// useNickname.ts - Hook para gerenciar nickname do usuário

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

// Lista de palavras bloqueadas
const BLOCKED_WORDS = [
  'admin', 'moderador', 'root', 'suporte', 'teste', 'test',
  'fuck', 'shit', 'damn', 'ass', 'bitch', 'bastard',
  'puta', 'merda', 'caralho', 'cuzao', 'filha da puta',
  'viado', 'bicha', 'gay', 'otario', 'idiota', 'burro',
  'palhao', 'mongo', 'retardado', 'debil', 'lixo'
];

const VALIDATION = {
  minLength: 3,
  maxLength: 30,
  regex: /^[^_\W]+[\w\sÀ-ÿ]*$/,
};

export interface NicknameValidation {
  isValid: boolean;
  error?: string;
}

export function validateNickname(nickname: string, currentNickname?: string): NicknameValidation {
  const trimmed = nickname.trim();
  
  // Verificar tamanho mínimo
  if (trimmed.length < VALIDATION.minLength) {
    return { isValid: false, error: `Mínimo ${VALIDATION.minLength} caracteres` };
  }
  
  // Verificar tamanho máximo
  if (trimmed.length > VALIDATION.maxLength) {
    return { isValid: false, error: `Máximo ${VALIDATION.maxLength} caracteres` };
  }
  
  // Verificar caracteres permitidos
  if (!VALIDATION.regex.test(trimmed)) {
    return { isValid: false, error: 'Apenas letras, números e espaços' };
  }
  
  // Verificar se começa com letra ou número
  if (!/^[a-zA-Z0-9]/.test(trimmed)) {
    return { isValid: false, error: 'Deve começar com letra ou número' };
  }
  
  // Verificar palavras bloqueadas
  const lowerNick = trimmed.toLowerCase();
  for (const word of BLOCKED_WORDS) {
    if (lowerNick.includes(word)) {
      return { isValid: false, error: 'Nome não permitido' };
    }
  }
  
  // Se não mudou, é válido
  if (currentNickname && trimmed === currentNickname) {
    return { isValid: true };
  }
  
  return { isValid: true };
}

export function useUpdateNickname() {
  const qc = useQueryClient();
  const [isChecking, setIsChecking] = useState(false);
  
  return useMutation({
    mutationFn: async ({ userId, nickname }: { userId: string; nickname: string }) => {
      const validation = validateNickname(nickname);
      if (!validation.isValid) {
        throw new Error(validation.error);
      }
      
      const trimmedNickname = nickname.trim();
      
      // Verificar se nickname já existe (case-insensitive)
      setIsChecking(true);
      const { data: existing } = await supabase
        .from('profiles')
        .select('id, nickname')
        .ilike('nickname', trimmedNickname)
        .neq('id', userId)
        .maybeSingle();
      
      if (existing) {
        setIsChecking(false);
        throw new Error('Este nickname já está em uso');
      }
      setIsChecking(false);
      
      // Atualizar nickname
      const { error } = await supabase
        .from('profiles')
        .update({ nickname: trimmedNickname })
        .eq('id', userId);
      
      if (error) throw error;
      
      return { nickname: trimmedNickname };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['userProfile'] });
      qc.invalidateQueries({ queryKey: ['ranking'] });
      qc.invalidateQueries({ queryKey: ['profile'] });
      qc.refetchQueries({ queryKey: ['userProfile'] });
    },
  });
}

export function useCheckNicknameAvailability() {
  return useMutation({
    mutationFn: async (nickname: string) => {
      const trimmed = nickname.trim();
      
      const { data: existing, error } = await supabase
        .from('profiles')
        .select('id')
        .ilike('nickname', trimmed)
        .maybeSingle();
      
      if (error) throw error;
      
      return {
        available: !existing,
        nickname: trimmed
      };
    },
  });
}

export function formatDisplayName(fullName?: string, nickname?: string | null): string {
  if (nickname) {
    return nickname;
  }
  if (fullName) {
    return fullName.split(' ')[0];
  }
  return 'Usuário';
}