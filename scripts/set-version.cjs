const fs = require("fs");

const version = process.argv[2];
if (!version) {
  console.error("Uso: node scripts/set-version.cjs <version>");
  process.exit(1);
}

for (const file of ["package.json", "src-tauri/tauri.conf.json"]) {
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  data.version = version;
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
}

console.log("Versao atualizada para", version);
