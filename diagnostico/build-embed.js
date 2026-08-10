const fs = require("fs");
const path = require("path");

const dir = __dirname;
const root = path.join(dir, "..");

let code = fs.readFileSync(path.join(root, "test-big-five.jsx"), "utf8");
code = code.replace(/^import[^\n]+\n\n/m, "");
code = code.replace("export default function TestBigFive", "function TestBigFive");
code = "const { useState, useRef } = React;\n\n" + code;
code +=
  '\n\nconst root = ReactDOM.createRoot(document.getElementById("root"));\nroot.render(<TestBigFive />);\n';

const htmlHead = fs.readFileSync(path.join(dir, "index.template.html"), "utf8");
const html = htmlHead.replace("<!-- APP_SOURCE -->", code);
fs.writeFileSync(path.join(dir, "index.html"), html, "utf8");
console.log("Built index.html (" + html.length + " bytes)");
