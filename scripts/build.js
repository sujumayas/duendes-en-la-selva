import { cp, mkdir, rm } from "node:fs/promises";

const output = new URL("../dist/", import.meta.url);
const root = new URL("../", import.meta.url);

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

await Promise.all([
  cp(new URL("index.html", root), new URL("index.html", output)),
  cp(new URL("styles.css", root), new URL("styles.css", output)),
  cp(new URL("src/", root), new URL("src/", output), { recursive: true }),
]);

console.log("Built deploy-ready site in dist/");
