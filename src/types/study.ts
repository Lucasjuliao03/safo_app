export interface Subject {
  id: string;
  name: string;
  icon: React.ComponentType<{ className?: string }> | string;
  questionCount: number;
  color: string;
}

export interface QuestionOption {
  id: string;
  text: string;
}

export interface Question {
  id: string;
  subjectId: string;
  topicId?: string | null;
  lawReferenceId?: number | null;
  lawReferenceName?: string | null;  // Nome curto da norma vinculada
  topic: string;
  subtopic: string;
  difficulty: "fácil" | "média" | "difícil";
  year: number;
  board: string;
  organ: string;
  statement: string;
  options: QuestionOption[];
  correctOption: string;
  explanation: string;
  format?: "multiple_choice" | "true_false";
}

export interface Flashcard {
  id: string;
  subjectId: string;
  topicId?: string | null;
  lawReferenceId?: number | null;
  lawReferenceName?: string | null;
  topic: string;
  front: string;
  back: string;
}

export interface DailyGoal {
  questionsTarget: number;
  questionsCompleted: number;
  flashcardsTarget: number;
  flashcardsCompleted: number;
}

export interface SubjectPerformance {
  subjectId: string;
  name: string;
  accuracy: number;
  totalAttempts: number;
}

export interface UserProgress {
  streak: number;
  xp: number;
  level: number;
  rank: string;
  dailyGoal: DailyGoal;
  weeklyXp: number[];
  subjectPerformance: SubjectPerformance[];
}

// ---- New types for persistence ----

export type UserRole = "student" | "admin";

export interface User {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  isApproved: boolean;
  createdAt: string;
  courseId?: number;
  editalId?: number | null;
  activeUntil?: string | null;
}

export interface UserAnswer {
  id: string;
  userId: string;
  questionId: string;
  selectedOption: string;
  isCorrect: boolean;
  answeredAt: string;
}

export interface FlashcardReview {
  id: string;
  userId: string;
  flashcardId: string;
  rating: "wrong" | "almost" | "correct";
  reviewedAt: string;
}

export interface UserStats {
  userId: string;
  totalAnswered: number;
  totalCorrect: number;
  streak: number;
  lastActivityDate: string;
  xp: number;
  level: number;
  rank: string;
  dailyGoal: DailyGoal;
  weeklyXp: number[];
}
