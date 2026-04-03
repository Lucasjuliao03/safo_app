import { useState } from "react";
import { ChevronRight, Check, X, Target, TrendingUp } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

interface SubjectStats {
  subjectId: string | number;
  name: string;
  icon: any;
  totalAttempts: number;
  totalCorrect: number;
  totalWrong: number;
  accuracy: number;
  topics?: TopicStats[];
}

interface TopicStats {
  id: string | number;
  name: string;
  totalAttempts: number;
  totalCorrect: number;
  totalWrong: number;
  accuracy: number;
}

interface PerformanceCardProps {
  subjects: SubjectStats[];
  isLoading?: boolean;
}

export function PerformanceCard({ subjects, isLoading }: PerformanceCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [expandedSubject, setExpandedSubject] = useState<string | number | null>(null);

  const totalQuestions = subjects.reduce((sum, s) => sum + s.totalAttempts, 0);
  const totalCorrect = subjects.reduce((sum, s) => sum + s.totalCorrect, 0);
  const overallAccuracy = totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0;

  if (isLoading) {
    return (
      <div className="rounded-2xl bg-card border border-border p-4 animate-pulse">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-muted" />
          <div className="flex-1">
            <div className="h-4 w-24 bg-muted rounded mb-2" />
            <div className="h-3 w-32 bg-muted rounded" />
          </div>
        </div>
      </div>
    );
  }

  if (subjects.length === 0) {
    return (
      <div className="rounded-2xl bg-card border border-border p-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center">
            <Target className="h-6 w-6 text-muted-foreground" />
          </div>
          <div>
            <p className="font-semibold text-foreground">Desempenho</p>
            <p className="text-xs text-muted-foreground">Responda questões para ver seu desempenho</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Card Principal */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full rounded-2xl bg-gradient-to-br from-success/15 to-success/5 border border-success/25 p-4 transition-all active:scale-[0.98]"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-success/20 flex items-center justify-center">
              <TrendingUp className="h-6 w-6 text-success" />
            </div>
            <div className="text-left">
              <p className="font-semibold text-foreground">Desempenho</p>
              <p className="text-xs text-muted-foreground">
                {subjects.length} matérias
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className={cn(
                "text-xl font-black",
                overallAccuracy >= 70 ? "text-success" : overallAccuracy >= 50 ? "text-warning" : "text-destructive"
              )}>
                {overallAccuracy}%
              </p>
              <div className="flex items-center gap-2 justify-end text-xs">
                <span className="text-success flex items-center gap-0.5">
                  <Check className="h-3 w-3" /> {totalCorrect}
                </span>
                <span className="text-destructive flex items-center gap-0.5">
                  <X className="h-3 w-3" /> {totalQuestions - totalCorrect}
                </span>
              </div>
            </div>
            <ChevronRight className={cn(
              "h-5 w-5 text-success transition-transform",
              isExpanded && "rotate-90"
            )} />
          </div>
        </div>
      </button>

      {/* Lista de Matérias */}
      {isExpanded && (
        <div className="space-y-2 pl-2 animate-slide-down">
          {subjects.map((subject) => (
            <SubjectAccordion
              key={String(subject.subjectId)}
              subject={subject}
              isExpanded={expandedSubject === subject.subjectId}
              onToggle={() => setExpandedSubject(expandedSubject === subject.subjectId ? null : subject.subjectId)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface SubjectAccordionProps {
  subject: SubjectStats;
  isExpanded: boolean;
  onToggle: () => void;
}

function SubjectAccordion({ subject, isExpanded, onToggle }: SubjectAccordionProps) {
  const accuracyColor = subject.accuracy >= 70 
    ? "text-success" 
    : subject.accuracy >= 50 
    ? "text-warning" 
    : "text-destructive";

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full p-3 flex items-center justify-between hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          {(() => {
            const Icon = subject.icon;
            if (!Icon) return <span className="text-xl">📚</span>;
            if (typeof Icon === 'function') return <Icon className="h-5 w-5 text-primary" />;
            if (typeof Icon === 'string') return <span className="text-xl">{Icon}</span>;
            return <span className="text-xl">📚</span>;
          })()}
          <div className="text-left">
            <p className="font-medium text-foreground text-sm">{subject.name}</p>
            <p className="text-[10px] text-muted-foreground">
              ✓{subject.totalCorrect} ✗{subject.totalWrong}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className={cn("text-sm font-bold", accuracyColor)}>
            {subject.accuracy}%
          </span>
          <ChevronRight className={cn(
            "h-4 w-4 text-muted-foreground transition-transform",
            isExpanded && "rotate-90"
          )} />
        </div>
      </button>

      {isExpanded && subject.topics && subject.topics.length > 0 && (
        <div className="border-t border-border p-2 space-y-1 bg-muted/30 animate-slide-down">
          {subject.topics.map((topic) => (
            <TopicItem key={String(topic.id)} topic={topic} />
          ))}
        </div>
      )}

      {isExpanded && (!subject.topics || subject.topics.length === 0) && (
        <div className="border-t border-border p-3 text-center text-xs text-muted-foreground bg-muted/30">
          Nenhum tema com questões respondidas
        </div>
      )}
    </div>
  );
}

function TopicItem({ topic }: { topic: TopicStats }) {
  const accuracyColor = topic.accuracy >= 70 
    ? "text-success" 
    : topic.accuracy >= 50 
    ? "text-warning" 
    : "text-destructive";

  return (
    <div className="flex items-center justify-between p-2 rounded-lg bg-card border border-border/50">
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-foreground truncate">{topic.name}</p>
        <p className="text-[10px] text-muted-foreground">
          <span className="text-success">✓{topic.totalCorrect}</span>
          {" · "}
          <span className="text-destructive">✗{topic.totalWrong}</span>
        </p>
      </div>
      <div className="flex items-center gap-2 ml-2">
        <div className="w-12">
          <Progress 
            value={topic.accuracy} 
            className={cn(
              "h-1",
              topic.accuracy >= 70 
                ? "[&>div]:bg-success" 
                : topic.accuracy >= 50 
                ? "[&>div]:bg-warning" 
                : "[&>div]:bg-destructive"
            )} 
          />
        </div>
        <span className={cn("text-xs font-bold w-8 text-right", accuracyColor)}>
          {topic.accuracy}%
        </span>
      </div>
    </div>
  );
}
