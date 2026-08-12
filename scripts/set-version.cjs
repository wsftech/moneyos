const fs = require("fs");

const version = process.argv[2];
if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
  console.error("Uso: node scripts/set-version.cjs <version>");
  console.error("Exemplo: node scripts/set-version.cjs 0.1.9");
  process.exit(1);
}

for (const file of ["package.json", "src-tauri/tauri.conf.json"]) {
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  data.version = version;
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
}

const cargoPath = "src-tauri/Cargo.toml";
let cargo = fs.readFileSync(cargoPath, "utf8");
const cargoNext = cargo.replace(/^version = ".*"$/m, `version = "${version}"`);
if (cargoNext === cargo) {
  console.error("Nao foi possivel atualizar version em src-tauri/Cargo.toml");
  process.exit(1);
}
fs.writeFileSync(cargoPath, cargoNext);

const lockPath = "src-tauri/Cargo.lock";
if (fs.existsSync(lockPath)) {
  let lock = fs.readFileSync(lockPath, "utf8");
  const lockNext = lock.replace(
    /(\[\[package\]\]\r?\nname = "financas"\r?\nversion = ")[^"]+/,
    `$1${version}`,
  );
  if (lockNext !== lock) {
    fs.writeFileSync(lockPath, lockNext);
  }
}

console.log("Versao atualizada para", version);
