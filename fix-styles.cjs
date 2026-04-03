const fs = require('fs');
const path = 'c:/appestudo/concurseiro-gil/src/pages/Questoes.tsx';
let content = fs.readFileSync(path, 'utf8');

content = content.replace(
  '<p className="text-sm leading-relaxed text-foreground">{question.statement}</p>',
  '<p className="text-sm leading-relaxed text-foreground whitespace-pre-wrap">{question.statement}</p>'
);

content = content.replaceAll(
  '<span className="text-sm text-foreground leading-relaxed flex-1">{opt.text}</span>',
  '<span className="text-sm text-foreground leading-relaxed flex-1 whitespace-pre-wrap text-left">{opt.text}</span>'
);

content = content.replace(
  '<p className="text-sm text-foreground/80 leading-relaxed">{question.explanation}</p>',
  '<p className="text-sm text-foreground/80 leading-relaxed whitespace-pre-wrap">{question.explanation}</p>'
);

fs.writeFileSync(path, content, 'utf8');
console.log('Styles applied!');
