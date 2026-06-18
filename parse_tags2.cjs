const fs = require('fs');
const content = fs.readFileSync('src/components/lobby/LobbyView.vue', 'utf-8');
const templateMatch = content.match(/<template>([\s\S]*?)<\/template>/);
if(!templateMatch) { console.log('no template'); process.exit(1); }
const template = templateMatch[1];
const tags = [...template.matchAll(/<\/?([a-zA-Z0-9\-]+)[^>]*>/g)];
const selfClosing = ['input', 'img', 'br', 'hr', 'meta', 'link'];
const stack = [];
for(const match of tags) {
  const tagContent = match[0];
  const tagName = match[1].toLowerCase();
  if(selfClosing.includes(tagName) || tagContent.trim().endsWith('/>')) continue;
  if(tagContent.startsWith('</')) {
    const last = stack.pop();
    if(last !== tagName) {
      console.log(`Mismatch! expected </${last}> but got ${tagContent} at index ${match.index}`);
      console.log('Context: ' + template.substring(Math.max(0, match.index - 80), match.index + 80));
      process.exit(1);
    }
  } else {
    stack.push(tagName);
  }
}
if(stack.length > 0) {
  console.log('Unclosed tags at the end:', stack);
} else {
  console.log('All tags matched correctly!');
}
