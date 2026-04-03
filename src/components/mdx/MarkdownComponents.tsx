import React from 'react';
import { cn } from '@/lib/utils';
import { Info } from 'lucide-react';

export const markdownComponents: import('react-markdown').Components = {
  h1: ({ className, ...props }) => (
    <h1 
      className={cn("text-3xl sm:text-4xl font-black text-foreground mt-10 mb-6 tracking-tight leading-tight", className)} 
      {...props} 
    />
  ),
  h2: ({ className, ...props }) => (
    <h2 
      className={cn("text-2xl sm:text-3xl font-bold text-foreground mt-10 mb-4 pb-2 border-b border-border/50", className)} 
      {...props} 
    />
  ),
  h3: ({ className, ...props }) => (
    <h3 
      className={cn("text-xl sm:text-2xl font-bold text-foreground mt-8 mb-4", className)} 
      {...props} 
    />
  ),
  p: ({ className, ...props }) => (
    <p 
      className={cn("text-base sm:text-lg text-foreground/80 leading-relaxed mb-5", className)} 
      {...props} 
    />
  ),
  a: ({ className, ...props }) => (
    <a 
      className={cn("text-primary font-bold hover:text-primary/80 underline decoration-primary/50 underline-offset-4 transition-colors", className)} 
      target="_blank" 
      rel="noopener noreferrer"
      {...props} 
    />
  ),
  strong: ({ className, ...props }) => (
    <strong 
      className={cn("font-bold text-foreground bg-primary/10 px-1.5 py-0.5 rounded-md", className)} 
      {...props} 
    />
  ),
  em: ({ className, ...props }) => (
    <em 
      className={cn("italic text-foreground/90 font-medium", className)} 
      {...props} 
    />
  ),
  ul: ({ className, ...props }) => (
    <ul 
      className={cn("my-6 ml-6 list-none space-y-3 relative", className)} 
      {...props} 
    />
  ),
  ol: ({ className, ...props }) => (
    <ol 
      className={cn("my-6 ml-6 list-decimal space-y-3 text-foreground/80 marker:text-primary marker:font-bold", className)} 
      {...props} 
    />
  ),
  li: ({ className, children, node, ...props }: any) => {
    // Only apply custom styling if it's inside a ul (node.tagName === 'li' and parent is 'ul' implicitly if we check list type, but react-markdown passes node tree).
    // The easiest way is to apply generic nice list styles. The empty content hack creates a custom bullet point.
    const isOrdered = node?.parent?.tagName === 'ol';
    
    return (
      <li 
        className={cn(
          "pl-2 text-base sm:text-lg text-foreground/80 relative", 
          !isOrdered && "before:content-[''] before:absolute before:left-[-1.25rem] before:top-[0.6rem] before:h-2 before:w-2 before:bg-primary/60 before:rounded-full",
          className
        )} 
        {...props}
      >
        {children}
      </li>
    );
  },
  // Transforming blockquote strictly into a beautiful callout/alert 
  blockquote: ({ className, children, ...props }) => (
    <div className={cn("my-8 flex gap-4 p-5 rounded-xl border border-primary/20 bg-primary/5 text-foreground/90 relative shadow-sm", className)}>
      <div className="flex-shrink-0 mt-0.5">
        <Info className="h-6 w-6 text-primary" />
      </div>
      <div className="flex-1 space-y-2 leading-relaxed">
        {/* We wrap children here to maintain blockquote syntax but render as Callout */}
        {children}
      </div>
    </div>
  ),
  hr: ({ className, ...props }) => (
    <hr 
      className={cn("my-12 border-t-2 border-border/60 border-dashed", className)} 
      {...props} 
    />
  ),
  table: ({ className, ...props }) => (
    <div className="my-8 w-full overflow-x-auto rounded-xl border border-border shadow-sm">
      <table className={cn("w-full text-left text-base whitespace-nowrap sm:whitespace-normal", className)} {...props} />
    </div>
  ),
  thead: ({ className, ...props }) => (
    <thead className={cn("bg-muted/50 border-b border-border text-foreground font-bold", className)} {...props} />
  ),
  th: ({ className, ...props }) => (
    <th className={cn("px-4 py-4 align-middle", className)} {...props} />
  ),
  td: ({ className, ...props }) => (
    <td className={cn("px-4 py-4 align-middle border-b border-border/50 text-foreground/80", className)} {...props} />
  ),
  code: ({ inline, className, children, ...props }: any) => {
    const match = /language-(\w+)/.exec(className || '');
    if (inline) {
      return (
        <code className={cn("relative rounded bg-muted/80 px-[0.4rem] py-[0.2rem] font-mono text-sm text-primary font-bold overflow-wrap-normal break-words", className)} {...props}>
          {children}
        </code>
      );
    }
    // Block code formatting
    return (
      <div className="relative my-8 rounded-xl overflow-hidden bg-[#1e1e2e] shadow-lg border border-[#313244] w-full max-w-full">
        <div className="flex items-center px-4 py-3 bg-[#181825] border-b border-[#313244]">
          <div className="flex gap-2">
            <div className="w-3.5 h-3.5 rounded-full bg-[#f38ba8]"></div>
            <div className="w-3.5 h-3.5 rounded-full bg-[#f9e2af]"></div>
            <div className="w-3.5 h-3.5 rounded-full bg-[#a6e3a1]"></div>
          </div>
          {match && <span className="ml-4 text-xs font-mono text-[#cdd6f4]/50">{match[1].toUpperCase()}</span>}
        </div>
        <pre className="p-5 overflow-x-auto w-full">
          <code className={cn("font-mono text-[15px] leading-relaxed text-[#cdd6f4] block min-w-full", className)} {...props}>
            {children}
          </code>
        </pre>
      </div>
    );
  },
};
