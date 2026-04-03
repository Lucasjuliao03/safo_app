import React from 'react';
import { AlertCircle, CheckCircle2, Info, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface AlertBoxProps {
  type?: 'info' | 'success' | 'warning' | 'error';
  title?: string;
  children: React.ReactNode;
}

export const AlertBox: React.FC<AlertBoxProps> = ({ type = 'info', title, children }) => {
  const styles = {
    info: 'bg-primary/10 border-primary/20 text-primary-foreground',
    success: 'bg-success/10 border-success/20 text-success-foreground',
    warning: 'bg-warning/10 border-warning/20 text-warning-foreground',
    error: 'bg-destructive/10 border-destructive/20 text-destructive-foreground',
  };

  const icons = {
    info: <Info className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />,
    success: <CheckCircle2 className="h-5 w-5 text-success mt-0.5 flex-shrink-0" />,
    warning: <AlertTriangle className="h-5 w-5 text-warning mt-0.5 flex-shrink-0" />,
    error: <AlertCircle className="h-5 w-5 text-destructive mt-0.5 flex-shrink-0" />,
  };

  return (
    <div className={cn('flex gap-3 p-4 my-6 rounded-xl border', styles[type])}>
      {icons[type]}
      <div className="flex-1">
        {title && <h5 className={cn('font-bold text-base mb-1', `text-${type}`)}>{title}</h5>}
        <div className="text-sm opacity-90 leading-relaxed space-y-2">
          {children}
        </div>
      </div>
    </div>
  );
};
