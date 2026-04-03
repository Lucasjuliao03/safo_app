const fs = require('fs');
let c = fs.readFileSync('src/components/PerformanceCard.tsx', 'utf8');

// Replace the complex icon rendering with a simple emoji-based approach
// The icon can be a React component (forwardRef object) which crashes when rendered as child of <span>
const oldRender = c.match(/\{typeof subject\.icon.*?\}/s);
if (oldRender) {
  c = c.replace(oldRender[0], '<span className="text-lg">📚</span>');
  console.log('Replaced complex icon render');
} else {
  // Try simpler match
  c = c.replace(
    /<span className="text-xl">\{subject\.icon\}<\/span>/,
    '<span className="text-lg">📚</span>'
  );
  console.log('Replaced simple icon render');
}
fs.writeFileSync('src/components/PerformanceCard.tsx', c);
console.log('Done');
