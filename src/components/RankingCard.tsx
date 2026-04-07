// RankingCard.tsx - Componente de Ranking

import { useState, useEffect, useRef } from 'react';
import { Trophy, TrendingUp, TrendingDown, Crown, Target, BookOpen } from 'lucide-react';
import { cn } from '@/lib/utils';
import { RankingUser } from '@/hooks/useRanking';
import { getAvatarUrl } from '@/hooks/useAvatar';

interface RankingCardProps {
  ranking: RankingUser[];
  currentUserId?: string;
  title?: string;
  showPodio?: boolean;
  activePeriod?: 'all' | 'weekly' | 'monthly';
  onPeriodChange?: (period: 'all' | 'weekly' | 'monthly') => void;
}

const COLORS = {
  gold: '#FFD700',
  silver: '#C0C0C0', 
  bronze: '#CD7F32',
};

function getAvatarElement(src: string | undefined, name: string, size: 'sm' | 'md' | 'lg', fallbackClass: string) {
  const sizeClasses = { sm: 'h-10 w-10', md: 'h-14 w-14', lg: 'h-20 w-20' };
  const avatarSrc = src || getAvatarUrl('default');
  return (
    <div className={cn(sizeClasses[size], "rounded-full border-2 border-gray-200 flex items-center justify-center overflow-hidden bg-gray-100")}>
      <img 
        src={avatarSrc} 
        alt={name}
        className="max-w-full max-h-full object-contain"
      />
    </div>
  );
}

export function RankingCard({ 
  ranking, 
  currentUserId, 
  title = "Ranking", 
  showPodio = true,
  activePeriod = 'weekly',
  onPeriodChange
}: RankingCardProps) {
  const [activeTab, setActiveTab] = useState<'all' | 'weekly' | 'monthly'>(activePeriod);

  const podium = ranking.slice(0, 3);
  const rest = ranking.slice(3);

  const currentUser = ranking.find(u => u.userId === currentUserId);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setActiveTab(activePeriod);
  }, [activePeriod]);

  const handlePeriodChange = (period: 'all' | 'weekly' | 'monthly') => {
    setActiveTab(period);
    onPeriodChange?.(period);
  };

  useEffect(() => {
    if (currentUser && currentUser.position > 3 && listRef.current) {
      const userElement = listRef.current.querySelector(`[data-user-id="${currentUser.userId}"]`);
      if (userElement) {
        setTimeout(() => {
          userElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 300);
      }
    }
  }, [ranking, currentUser]);

  return (
    <div className="rounded-2xl bg-white/90 backdrop-blur-sm border border-white/20 overflow-hidden shadow-sm">
      {/* Header */}
      <div className="p-4 border-b border-gray-100">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-yellow-500" />
            <h2 className="font-bold text-gray-900">{title}</h2>
          </div>
        </div>

        {/* Tabs de período */}
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {(['all', 'weekly', 'monthly'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => handlePeriodChange(tab)}
              className={cn(
                "flex-1 text-xs font-medium py-1.5 px-2 rounded-md transition-all",
                activeTab === tab 
                  ? "bg-white text-gray-900 shadow-sm" 
                  : "text-gray-500 hover:text-gray-900"
              )}
            >
              {tab === 'all' ? 'Geral' : tab === 'weekly' ? 'Semanal' : 'Mensal'}
            </button>
          ))}
        </div>
      </div>

      {/* Podium */}
      {showPodio && podium.length > 0 && (
        <div className="p-4 bg-gray-50 border-b border-gray-100">
          <div className="flex items-end justify-center gap-6">
            {/* 2º lugar */}
            {podium[1] && (
              <div className="flex flex-col items-center">
                {getAvatarElement(podium[1].userAvatar, podium[1].userName, 'md', '')}
                <div className="mt-2 px-2 py-0.5 text-xs font-bold rounded" style={{ backgroundColor: COLORS.silver, color: '#374151' }}>2º</div>
                <p className="text-sm font-semibold text-gray-800 mt-2 max-w-[80px] truncate text-center">
                  {podium[1].userName}
                </p>
                <p className="text-xs font-bold mt-1" style={{ color: COLORS.silver }}>{Math.round(podium[1].finalScore)}</p>
              </div>
            )}

            {/* 1º lugar */}
            {podium[0] && (
              <div className="flex flex-col items-center -mb-2">
                <div className="relative">
                  <Crown className="h-10 w-10 absolute -top-4 left-1/2 -translate-x-1/2 z-10" style={{ color: COLORS.gold }} />
                  {getAvatarElement(podium[0].userAvatar, podium[0].userName, 'lg', '')}
                </div>
                <div className="mt-2 px-3 py-0.5 text-xs font-bold rounded" style={{ backgroundColor: COLORS.gold, color: '#374151' }}>1º</div>
                <p className="text-base font-bold text-gray-900 mt-2 max-w-[100px] truncate text-center">
                  {podium[0].userName}
                </p>
                <p className="text-sm font-black mt-1" style={{ color: COLORS.gold }}>{Math.round(podium[0].finalScore)}</p>
              </div>
            )}

            {/* 3º lugar */}
            {podium[2] && (
              <div className="flex flex-col items-center">
                {getAvatarElement(podium[2].userAvatar, podium[2].userName, 'md', '')}
                <div className="mt-2 px-2 py-0.5 text-xs font-bold rounded" style={{ backgroundColor: COLORS.bronze, color: '#374151' }}>3º</div>
                <p className="text-sm font-semibold text-gray-800 mt-2 max-w-[80px] truncate text-center">
                  {podium[2].userName}
                </p>
                <p className="text-xs font-bold mt-1" style={{ color: COLORS.bronze }}>{Math.round(podium[2].finalScore)}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Lista de ranking */}
      <div className="p-2 space-y-2 max-h-[400px] overflow-y-auto" ref={listRef}>
        {rest.map((user) => (
          <div
            data-user-id={user.userId}
            key={user.userId}
            className={cn(
              "flex items-center gap-3 p-3 rounded-xl transition-all",
              user.isCurrentUser 
                ? "bg-blue-50 border-2 border-blue-400 shadow-md ring-2 ring-blue-300" 
                : "bg-gray-50 hover:bg-gray-100"
            )}
          >
            <span className={cn(
              "w-8 text-center text-base font-bold",
              user.position === 1 ? "text-yellow-500" :
              user.position === 2 ? "text-gray-400" :
              user.position === 3 ? "text-amber-700" : "text-gray-500"
            )}>
              {user.position}º
            </span>

            {getAvatarElement(user.userAvatar, user.userName, 'sm', '')}

            <div className="flex-1 min-w-0">
              <p className={cn(
                "text-base font-semibold truncate",
                user.isCurrentUser ? "text-blue-700" : "text-gray-800"
              )}>
                {user.userName}
                {user.isCurrentUser && <span className="ml-2 text-xs bg-blue-200 text-blue-800 px-2 py-0.5 rounded-full">Você</span>}
              </p>
              <div className="flex items-center gap-3 text-xs text-gray-500 mt-0.5">
                <span className="flex items-center gap-1">
                  <Target className="h-3 w-3" />
                  {user.accuracy}%
                </span>
                <span className="flex items-center gap-1">
                  <BookOpen className="h-3 w-3" />
                  {user.questionsTotal}
                </span>
              </div>
            </div>

            <div className="text-right">
              <p className="text-base font-bold text-gray-700">{Math.round(user.finalScore)}</p>
              {user.positionChange !== 0 && (
                <div className={cn(
                  "flex items-center gap-0.5 text-xs",
                  user.positionChange > 0 ? "text-green-600" : "text-red-500"
                )}>
                  {user.positionChange > 0 ? (
                    <TrendingUp className="h-3 w-3" />
                  ) : (
                    <TrendingDown className="h-3 w-3" />
                  )}
                  {Math.abs(user.positionChange)}
                </div>
              )}
            </div>
          </div>
        ))}

        {ranking.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            <Trophy className="h-12 w-12 mx-auto mb-2 opacity-30" />
            <p className="text-sm">Nenhum participante ainda</p>
            <p className="text-xs">Seja o primeiro a participar!</p>
          </div>
        )}
      </div>

      {/* Usuário atual fora do top 3 */}
      {currentUser && currentUser.position > 3 && (
        <div className="p-4 border-t border-gray-200 bg-blue-50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-lg font-bold text-blue-600">#{currentUser.position}</span>
              <span className="text-sm font-medium text-gray-700">Sua posição</span>
            </div>
            <span className="text-sm font-bold text-blue-600">{Math.round(currentUser.finalScore)} pts</span>
          </div>
        </div>
      )}

      {/* Usuário atual no top 3 */}
      {currentUser && currentUser.position <= 3 && (
        <div className="p-3 border-t border-gray-200 bg-blue-50 flex items-center justify-center">
          <span className="text-sm font-medium text-blue-700">
            🎉 Você está em {currentUser.position}º lugar!
          </span>
        </div>
      )}
    </div>
  );
}

// Mini versão do ranking para sidebar
export function MiniRanking({ ranking, currentUserId }: { ranking: RankingUser[]; currentUserId?: string }) {
  const top5 = ranking.slice(0, 5);
  const currentUser = ranking.find(u => u.userId === currentUserId);

  return (
    <div className="rounded-xl bg-white border border-gray-200 p-3">
      <div className="flex items-center gap-2 mb-3">
        <Trophy className="h-4 w-4 text-yellow-500" />
        <span className="font-bold text-gray-800 text-sm">Ranking</span>
      </div>

      <div className="space-y-2">
        {top5.map(user => (
          <div key={user.userId} className={cn(
            "flex items-center gap-2 p-2 rounded-lg",
            user.isCurrentUser && "bg-blue-50"
          )}>
            <span className={cn(
              "w-5 text-center text-xs font-bold",
              user.position === 1 ? "text-yellow-500" :
              user.position === 2 ? "text-gray-400" :
              user.position === 3 ? "text-amber-700" : "text-gray-500"
            )}>
              {user.position}º
            </span>
            <div className="flex-1 min-w-0">
              <p className={cn(
                "text-xs font-medium truncate",
                user.isCurrentUser ? "text-blue-700" : "text-gray-700"
              )}>
                {user.userName}
              </p>
            </div>
            <span className="text-xs font-bold text-gray-600">{Math.round(user.finalScore)}</span>
          </div>
        ))}

        {currentUser && currentUser.position > 5 && (
          <div className="flex items-center gap-2 pt-2 border-t border-gray-200">
            <span className="text-xs font-bold text-blue-600">#{currentUser.position}</span>
            <span className="text-xs text-gray-500">Você</span>
          </div>
        )}
      </div>
    </div>
  );
}
