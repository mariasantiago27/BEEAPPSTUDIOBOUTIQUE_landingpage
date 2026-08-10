const fs = require("fs");
const path = require("path");

const root = __dirname;

function walk(dir, acc = []) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (name === "node_modules" || name === ".git") continue;
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, acc);
    else if (/\.html$/.test(name)) acc.push(p);
  }
  return acc;
}

const replacements = [
  ['<a class="logo" href="../index.html">Chus <span>Sama</span></a>', '<a class="logo" href="../index.html">Optimiza-<span>T</span></a>'],
  ['<a class="logo" href="../../index.html">Chus <span>Sama</span></a>', '<a class="logo" href="../../index.html">Optimiza-<span>T</span></a>'],
  ['<a class="logo" href="index.html">Chus <span>Sama</span></a>', '<a class="logo" href="index.html">Optimiza-<span>T</span></a>'],
  ['<a class="brand" href="../index.html">Chus <span>Sama</span></a>', '<a class="brand" href="../index.html">Optimiza-<span>T</span></a>'],
  ['content="Chus Sama"', 'content="Optimiza-T con IA"'],
  ['| Chus Sama</title>', '| Optimiza-T con IA</title>'],
  ['| Chus Sama">', '| Optimiza-T con IA">'],
  ['"name": "Chus Sama"', '"name": "Optimiza-T con IA"'],
  ['"name": "Servicios de Chus Sama"', '"name": "Servicios de Optimiza-T con IA"'],
  ['Experiencia de cliente y rentabilidad, con tecnología. Barcelona.', 'Tecnología a medida para negocios de servicios. Barcelona.'],
  ['Tecnología humana y cercana para negocios con alma. Barcelona.', 'Tecnología a medida para negocios de servicios. Barcelona.'],
  ['Consultora de experiencia de cliente y rentabilidad', 'Consultora de IA y sistemas a medida para negocios de servicios'],
  ['Hacer mi diagnóstico gratis', 'Hacer el test gratis'],
  ['Hacer la auditoría digital gratis', 'Hacer el test Big Five gratis'],
  ['Empezar mi safari →', 'Hacer el test →'],
  ['10 preguntas · 3 minutos', '5 preguntas · 3 minutos'],
  ['El Mapa de Safari', 'La Radiografía de tu negocio'],
  ['Reservar mi Mapa', 'Reservar mi Radiografía'],
  ['Chus Sama te ayuda', 'Optimiza-T con IA te ayuda'],
  ['de Chus Sama', 'de Optimiza-T con IA'],
  ['Chus Sama diseña', 'Optimiza-T con IA diseña'],
  ['Chus Sama acompaña', 'Optimiza-T con IA acompaña'],
  ['La consultoría IA para pymes de Chus Sama', 'La consultoría IA para pymes de Optimiza-T con IA'],
  ['Caso real de Chus Sama', 'Caso real de Optimiza-T con IA'],
  ['| Chus Sama Barcelona', '| Optimiza-T con IA'],
];

let count = 0;
for (const file of walk(root)) {
  if (file.includes("_rebrand-global.js")) continue;
  let text = fs.readFileSync(file, "utf8");
  const orig = text;
  for (const [a, b] of replacements) {
    text = text.split(a).join(b);
  }
  if (text !== orig) {
    fs.writeFileSync(file, text, "utf8");
    count++;
    console.log("updated:", path.relative(root, file));
  }
}
console.log("Done.", count, "files");
