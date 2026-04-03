const fs = require('fs');

// 1. Fix PerformanceCard - render icon as component, not plain text
let perf = fs.readFileSync('src/components/PerformanceCard.tsx', 'utf8');
perf = perf.replace(
  'icon: string;',
  'icon: any;'
);
perf = perf.replace(
  '<span className="text-xl">{subject.icon}</span>',
  '{typeof subject.icon === "function" ? (() => { const Icon = subject.icon; return <Icon className="h-5 w-5 text-primary" />; })() : <span className="text-xl">{String(subject.icon)}</span>}'
);
fs.writeFileSync('src/components/PerformanceCard.tsx', perf);
console.log('[1/2] PerformanceCard fixed');

// 2. Fix subtopics query in useStudyData
let hooks = fs.readFileSync('src/hooks/useStudyData.ts', 'utf8');
hooks = hooks.replace(
  'subtopics(name, target_course_ids)',
  'subtopics(name)'
);
fs.writeFileSync('src/hooks/useStudyData.ts', hooks);
console.log('[2/2] subtopics query fixed');
