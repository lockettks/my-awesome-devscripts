#!/usr/bin/env node
import fs from "fs";
import path from "path";
import clipboardy from "clipboardy";
import os from "os";

// Allowed file extensions to include when copying a folder
const allowedExtensions = [".js", ".jsx", ".ts", ".tsx", ".json", ".css", ".scss", ".md", ".txt"];

function expandHome(filePath) {
    if (!filePath) return filePath;
    if (filePath.startsWith('~')) {
        return path.join(os.homedir(), filePath.slice(1));
    }
    return filePath;
}

// Recursively get all files from a folder matching allowed extensions
function getFilesRecursively(dir) {
    let results = [];
    const list = fs.readdirSync(dir, { withFileTypes: true });
    for (const dirent of list) {
        const fullPath = path.join(dir, dirent.name);
        if (dirent.isDirectory()) {
            results = results.concat(getFilesRecursively(fullPath));
        } else if (allowedExtensions.includes(path.extname(dirent.name).toLowerCase())) {
            results.push(fullPath);
        }
    }
    return results;
}

// Get input paths (files or folders) from CLI
const inputPaths = process.argv.slice(2).map(expandHome);
if (inputPaths.length === 0) {
    console.error("❌ Please provide at least one file or folder path.");
    process.exit(1);
}

let output = "";

// Process each input
for (const inputPath of inputPaths) {
    const absPath = path.resolve(inputPath);

    let filesToCopy = [];
    try {
        const stats = fs.statSync(absPath);
        if (stats.isDirectory()) {
            filesToCopy = getFilesRecursively(absPath);
        } else if (stats.isFile()) {
            filesToCopy = [absPath];
        }
    } catch (err) {
        console.error(`⚠️ Cannot access ${inputPath}: ${err.message}`);
        continue;
    }

    for (const filePath of filesToCopy) {
        try {
            const contents = fs.readFileSync(filePath, "utf8");
            const fileName = path.relative(process.cwd(), filePath);
            const ext = path.extname(fileName).toLowerCase();
            const commentPrefix = allowedExtensions.includes(ext) ? "//" : "#";

            // Formatting: header, code, footer separator
            output += `\n${"=".repeat(80)}\n`;
            output += `${commentPrefix} ${fileName}\n`;
            output += `${contents.trim()}\n`;
            output += `${"=".repeat(80)}\n`;
        } catch (err) {
            console.error(`⚠️ Could not read ${filePath}: ${err.message}`);
        }
    }
}

// Copy to clipboard
try {
    await clipboardy.write(output.trim());
    console.log(`✅ Copied ${output ? "all files" : "0 files"} to clipboard.`);
} catch (err) {
    console.error("❌ Failed to copy to clipboard:", err.message);
}
