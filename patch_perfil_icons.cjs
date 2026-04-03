const fs = require('fs');

// --- Perfil.tsx Fix ---
let perfil = fs.readFileSync('src/pages/Perfil.tsx', 'utf8');
// Only replace if it doesn't already have it
if (!perfil.includes('const courseId = user?.courseId')) {
  perfil = perfil.replace(
    'const { user, isAdmin, logout } = useAuth();',
    'const { user, isAdmin, logout } = useAuth();\n  const courseId = user?.courseId ? String(user.courseId) : null;'
  );
  perfil = perfil.replace(
    'useSubjects();',
    'useSubjects(isAdmin ? undefined : courseId);'
  );
  perfil = perfil.replace(
    'useQuestions();',
    'useQuestions(isAdmin ? undefined : courseId);'
  );
  fs.writeFileSync('src/pages/Perfil.tsx', perfil);
  console.log('Perfil.tsx patched');
}

// --- PerformanceCard.tsx Fix ---
let perf = fs.readFileSync('src/components/PerformanceCard.tsx', 'utf8');
// Fix the icon render block with a more robust pattern
// Replaced `<span className="text-lg">📚</span>` with proper conditional rendering
const iconTarget = '<span className="text-lg">📚</span>';
if (perf.includes(iconTarget)) {
  const iconReplacement = `{(() => {
            const Icon = subject.icon;
            return (typeof Icon === 'function' || (typeof Icon === 'object' && Icon !== null))
              ? <Icon className="h-5 w-5 text-primary" />
              : <span className="text-xl">📚</span>;
          })()}`;
  perf = perf.replace(iconTarget, iconReplacement);
  
  // Also ensure `icon: any;` in the interface
  perf = perf.replace('icon: string;', 'icon: any;');
  
  fs.writeFileSync('src/components/PerformanceCard.tsx', perf);
  console.log('PerformanceCard.tsx patched');
} else {
  console.log('PerformanceCard.tsx target not found, might be already patched or different structure.');
}
