// EditNickname.tsx - Componente para editar nickname

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { validateNickname, useUpdateNickname, useCheckNicknameAvailability, formatDisplayName } from '@/hooks/useNickname';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Check, X, Loader2, User, AtSign } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useUserProfile } from '@/hooks/useStudyData';
import { supabase } from '@/lib/supabase';

interface EditNicknameProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditNickname({ open, onOpenChange }: EditNicknameProps) {
  const { user } = useAuth();
  const { data: profile } = useUserProfile(user?.id);
  const [nickname, setNickname] = useState('');
  const [validation, setValidation] = useState<{ isValid: boolean; error?: string }>({ isValid: true });
  const [isChecking, setIsChecking] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);
  
  const updateMutation = useUpdateNickname();
  const checkMutation = useCheckNicknameAvailability();

  // Carregar nickname atual
  useEffect(() => {
    if (open && user?.id) {
      // Buscar nickname do perfil
      const fetchNickname = async () => {
        const { data } = await supabase
          .from('profiles')
          .select('nickname')
          .eq('id', user.id)
          .single();
        if (data?.nickname) {
          setNickname(data.nickname);
        }
      };
      fetchNickname();
    }
  }, [open, user?.id]);

  // Validar em tempo real
  useEffect(() => {
    if (!nickname.trim()) {
      setValidation({ isValid: true });
      setAvailable(null);
      return;
    }

    const currentNickname = profile?.nickname;
    const result = validateNickname(nickname, currentNickname || undefined);
    setValidation(result);
    
    if (result.isValid) {
      setAvailable(null);
    }
  }, [nickname, profile?.nickname]);

  // Verificar disponibilidade ao parar de digitar
  useEffect(() => {
    if (!validation.isValid || !nickname.trim() || nickname === profile?.nickname) {
      return;
    }

    const timer = setTimeout(async () => {
      setIsChecking(true);
      try {
        const result = await checkMutation.mutateAsync(nickname);
        setAvailable(result.available);
      } catch (err) {
        console.error(err);
      } finally {
        setIsChecking(false);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [nickname, validation.isValid, profile?.nickname]);

  const handleSave = async () => {
    if (!user?.id || !validation.isValid) return;

    try {
      await updateMutation.mutateAsync({
        userId: user.id,
        nickname: nickname.trim()
      });
      onOpenChange(false);
    } catch (err: any) {
      alert(err.message || 'Erro ao salvar nickname');
    }
  };

  const currentDisplay = formatDisplayName(profile?.full_name || undefined, profile?.nickname || undefined);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Editar Nome</DialogTitle>
          <DialogDescription>
            Escolha um nickname único para se identificar no ranking e disputas.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Preview atual */}
          <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
            <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center">
              <User className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Nome atual</p>
              <p className="font-medium text-foreground">{currentDisplay}</p>
            </div>
          </div>

          {/* Input do nickname */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Novo nickname</label>
            <div className="relative">
              <AtSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="seu_nickname"
                className={cn(
                  "pl-9",
                  validation.error && "border-destructive",
                  available === true && "border-success",
                  available === false && "border-destructive"
                )}
                maxLength={30}
              />
              {isChecking && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
              )}
              {!isChecking && validation.isValid && available === true && nickname !== profile?.nickname && (
                <Check className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-success" />
              )}
            </div>
            
            {/* Validações */}
            <div className="flex flex-wrap gap-1">
              {!validation.isValid && (
                <Badge variant="destructive" className="text-xs">
                  <X className="h-3 w-3 mr-1" />
                  {validation.error}
                </Badge>
              )}
              {available === false && (
                <Badge variant="destructive" className="text-xs">
                  <X className="h-3 w-3 mr-1" />
                  Já está em uso
                </Badge>
              )}
              {available === true && (
                <Badge variant="outline" className="text-xs border-success text-success">
                  <Check className="h-3 w-3 mr-1" />
                  Disponível
                </Badge>
              )}
            </div>
            
            <p className="text-xs text-muted-foreground">
              Mínimo 3, máximo 30 caracteres. Letras, números, espaços e acentos são permitidos.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button 
            onClick={handleSave}
            disabled={!validation.isValid || !nickname.trim() || updateMutation.isPending || (available === false)}
          >
            {updateMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Salvando...
              </>
            ) : (
              'Salvar'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Versão simples para uso no perfil
export function NicknameDisplay({ 
  nickname, 
  fullName, 
  onEdit 
}: { 
  nickname?: string | null; 
  fullName?: string | null;
  onEdit?: () => void;
}) {
  const display = formatDisplayName(fullName || undefined, nickname || undefined);
  const isNickname = !!nickname;

  return (
    <div className="flex items-center gap-2">
      <span className={cn(
        "font-medium",
        isNickname ? "text-primary" : "text-foreground"
      )}>
        {display}
      </span>
      {onEdit && (
        <Button variant="ghost" size="sm" onClick={onEdit} className="text-xs text-muted-foreground hover:text-foreground">
          Editar
        </Button>
      )}
    </div>
  );
}