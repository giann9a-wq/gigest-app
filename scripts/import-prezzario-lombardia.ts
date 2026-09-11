import fs from "fs/promises";
import path from "path";
import { importPriceList, isSupportedPriceListFile } from "../lib/price-list-import";

async function main() {
  const folder = process.argv[2];
  const versionName = process.argv[3] || "Prezzario Regione Lombardia 2026";
  if (!folder) throw new Error("Uso: tsx scripts/import-prezzario-lombardia.ts <cartella> [nome versione]");

  const fileNames = (await fs.readdir(folder)).filter(isSupportedPriceListFile);
  const files = await Promise.all(
    fileNames.map(async (name) => ({ name, buffer: await fs.readFile(path.join(folder, name)) }))
  );
  const result = await importPriceList({ name: versionName, sourceLabel: folder, files });
  console.log(`Import completato: ${result.itemCount} voci da ${result.fileCount} file (versione ${result.versionId}).`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
