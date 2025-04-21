import { writeFile, readdir, readFile, mkdir, rmdir } from "fs/promises";
import { join, basename } from "path";

import { createWriteStream } from "fs";
import { promisify } from "util";
import { pipeline } from "stream";
import { extract } from "zip-lib";
const streamPipeline = promisify(pipeline);

const inputDir = "./src/icons/raw";
const outputDir = "./src/icons/components";
const tempDir = "./temp";
const zipUrl =
  "https://github.com/krystonschwarze/coolicons/releases/download/v4.1/coolicons.v4.1.zip";

const template = (name, svgContent) => {
  const inner = svgContent
    .replace(/<svg[^>]*>/, "")
    .replace(/<\/svg>/, "")
    .trim()
    .replace(/stroke=\"black\"/g, 'stroke={props.color || "black"}');

  return `import * as React from "react";
import Svg, { Path } from "react-native-svg";
/**
 * @typedef {import('react-native-svg').SvgProps} SvgProps
 * @typedef {import('react').ReactElement} ReactElement
 * @param {SvgProps} props
 * @returns {ReactElement}
 */
export const ${name} = (props) => (
  <Svg viewBox="0 0 24 24" fill="none" {...props}>
    ${inner}
  </Svg>
);
`;
};

const toPascalCase = (str) => {
  const pascal = str.replace(/(^\w|[-_]\w)/g, (s) => s.replace(/[-_]/, "").toUpperCase());
  // Add 'Icon' prefix to avoid conflicts with React Native components
  if (["Svg", "Path", "React"].includes(pascal)) {
    return `${pascal}Icon`;
  }
  return pascal;
};

async function downloadAndExtract() {
  try {
    await mkdir(tempDir, { recursive: true });

    console.log("Downloading latest coolicons...");
    const response = await fetch(zipUrl);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

    const zipPath = join(tempDir, "coolicons.zip");
    const fileStream = createWriteStream(zipPath);
    await streamPipeline(response.body, fileStream);

    console.log("Extracting icons...");
    await extract(zipPath, tempDir);

    // Move SVGs from extracted dir to raw dir
    const svgFiles = await readdir(join(tempDir, "coolicons.iconjar", "icons"));
    await mkdir(inputDir, { recursive: true });

    for (const file of svgFiles.filter((f) => f.endsWith(".svg"))) {
      const content = await readFile(join(tempDir, "coolicons.iconjar", "icons", file));
      await writeFile(join(inputDir, file), content);
    }

    console.log("Icons downloaded and extracted successfully");

    // Cleanup temp and raw folders
    await rmdir(tempDir, { recursive: true }).catch(() => {});
  } catch (error) {
    console.error("Error downloading or extracting icons:", error);
    throw error;
  }
}

async function generate() {
  await mkdir(outputDir, { recursive: true });
  const files = await readdir(inputDir);
  let indexContent = "";
  for (const file of files.filter((f) => f.endsWith(".svg"))) {
    const raw = await readFile(join(inputDir, file), "utf-8");
    const filen = basename(file, ".svg");
    const name = toPascalCase(filen);
    const content = template(name, raw);
    await writeFile(join(outputDir, `${filen}.jsx`), content);
    indexContent += `export { ${name} } from "./${filen}";\n`;
  }
  await writeFile(join(outputDir, "index.js"), indexContent);

  await rmdir(inputDir, { recursive: true }).catch(() => {});
}

async function main() {
  try {
    await downloadAndExtract();
    await generate();
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

main();
