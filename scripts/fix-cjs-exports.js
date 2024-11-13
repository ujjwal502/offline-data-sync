import { readdir, readFile, writeFile } from "fs/promises";
import { join } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const CJS_DIR = join(__dirname, "..", "dist", "cjs");

async function fixExports(dir) {
  const files = await readdir(dir, { withFileTypes: true });

  for (const file of files) {
    if (file.isDirectory()) {
      await fixExports(join(dir, file.name));
      continue;
    }

    if (!file.name.endsWith(".js")) continue;

    const filePath = join(dir, file.name);
    let content = await readFile(filePath, "utf8");

    // Replace ESM imports with require
    content = content.replace(
      /import \{([^}]+)\} from ["']([^"']+)["'];?/g,
      (match, imports, path) => {
        // Handle relative imports
        const adjustedPath = path.replace(/\.js$/, "");
        return `const {${imports}} = require("${adjustedPath}");`;
      }
    );

    // Replace export declarations
    content = content.replace(/export (\{[^}]+\});/, "module.exports = $1;");
    content = content.replace(
      /export class ([^ ]+)/,
      "class $1\nmodule.exports.$1 = $1;"
    );
    content = content.replace(
      /export type (\{[^}]+\});/,
      "module.exports.types = $1;"
    );

    await writeFile(filePath, content);
  }
}

fixExports(CJS_DIR).catch(console.error);
