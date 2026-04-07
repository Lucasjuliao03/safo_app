// AvatarSelector.tsx - Componente para selecionar avatar

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Check, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useUserAvatar, useUpdateAvatar, getAvatarUrl, useAvailableAvatars, loadAvailableAvatars } from '@/hooks/useAvatar';

interface AvatarSelectorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId?: string;
}

export function AvatarSelector({ open, onOpenChange, userId }: AvatarSelectorProps) {
  const [selectedAvatar, setSelectedAvatar] = useState<string | null>(null);
  
  const { data: currentAvatar, isLoading } = useUserAvatar(userId);
  const { data: availableAvatars = [], refetch: refetchAvatars } = useAvailableAvatars();
  const updateMutation = useUpdateAvatar();

  // Recarregar manifest ao abrir o modal
  useEffect(() => {
    if (open) {
      // Recarregar manifest para pegar novos arquivos
      loadAvailableAvatars().then(() => {
        refetchAvatars();
      });
    }
  }, [open, refetchAvatars]);

  const handleSelect = (avatar: string) => {
    setSelectedAvatar(avatar);
  };

  const handleSave = async () => {
    if (!userId || !selectedAvatar) return;

    try {
      await updateMutation.mutateAsync({
        userId,
        avatar: selectedAvatar
      });
      onOpenChange(false);
    } catch (err: any) {
      alert(err.message || 'Erro ao salvar avatar');
    }
  };

  const handleCancel = () => {
    setSelectedAvatar(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Escolher Avatar</DialogTitle>
          <DialogDescription>
            Selecione um avatar para exibir no seu perfil e ranking.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Avatar atual */}
          <div className="flex items-center justify-center p-4 bg-muted/50 rounded-lg">
            {isLoading ? (
              <Loader2 className="h-16 w-16 animate-spin text-muted-foreground" />
            ) : (
              <img
                src={getAvatarUrl(selectedAvatar || currentAvatar)}
                alt="Avatar atual"
                className="h-16 w-16 rounded-full object-contain"
                onError={(e) => {
                  // Fallback se imagem falhar
                  (e.target as HTMLImageElement).src = getAvatarUrl('default');
                }}
              />
            )}
          </div>

          {/* Grid de avatares */}
          {availableAvatars.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>Nenhum avatar disponível</p>
              <p className="text-xs mt-2">Adicione imagens na pasta public/avatar e atualize o manifest.json</p>
            </div>
          ) : (
            <div className="grid grid-cols-4 gap-3 max-h-[400px] overflow-y-auto p-1">
              {availableAvatars.map((avatar) => (
                <button
                  key={avatar}
                  onClick={() => handleSelect(avatar)}
                  className={cn(
                    "relative aspect-square rounded-xl overflow-hidden border-2 transition-all flex items-center justify-center bg-muted/30 p-2",
                    (selectedAvatar || currentAvatar) === avatar
                      ? "border-primary ring-2 ring-primary/30"
                      : "border-transparent hover:border-muted-foreground/30"
                  )}
                >
                  <img
                    src={getAvatarUrl(avatar)}
                    alt={avatar}
                    className="max-w-full max-h-full object-contain"
                    onError={(e) => {
                      // Fallback se imagem falhar
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                  {(selectedAvatar || currentAvatar) === avatar && (
                    <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                      <Check className="h-6 w-6 text-primary" />
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-4">
          <Button variant="outline" onClick={handleCancel}>
            Cancelar
          </Button>
          <Button
            onClick={handleSave}
            disabled={!selectedAvatar || updateMutation.isPending}
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
        </div>
      </DialogContent>
    </Dialog>
  );
}