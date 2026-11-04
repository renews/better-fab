// Parse every source/test file without executing browser code or writing output.
const files = ["background.js", "content.js", "popup.js"];
for (const directory of ["modules", "scripts", "test"]) {
  for await (const file of new Bun.Glob("*.{js,ts}").scan(directory)) {
    files.push(`${directory}/${file}`);
  }
}
for (const file of files) {
  const loader = file.endsWith(".ts") ? "ts" : "js";
  new Bun.Transpiler({ loader }).transformSync(await Bun.file(file).text());
}
console.log(`Syntax checked ${files.length} JavaScript/TypeScript files`);
