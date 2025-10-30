#!/usr/bin/env node
import fs from "fs";
import path from "path";
import clipboardy from "clipboardy";

const files = process.argv.slice(2);
if (files.length === 0) {
    console.error("❌ Please provide at least one file path.");
    process.exit(1);
}

let output = "";
for (const filePath of files) {
    try {
        const absPath = path.resolve(filePath);
        const contents = fs.readFileSync(absPath, "utf8");
        const fileName = path.basename(absPath);
        const ext = path.extname(fileName).toLowerCase();
        const commentPrefix = [".js", ".jsx", ".ts", ".tsx", ".json", ".css", ".scss", ".md", ".txt"].includes(ext)
            ? "//"
            : "#";
        output += `${commentPrefix} ${fileName}\n${contents.trim()}\n\n`;
    } catch (err) {
        console.error(`⚠️ Could not read ${filePath}: ${err.message}`);
    }
}

try {
    await clipboardy.write(output);
    console.log(`✅ Copied ${files.length} file(s) to clipboard.`);
} catch (err) {
    console.error("❌ Failed to copy to clipboard:", err.message);
}
