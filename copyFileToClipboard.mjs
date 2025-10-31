#!/usr/bin/env node
/**
 * copyFileToClipboard.mjs
 *
 * Single-file tool for WebStorm External Tools.
 * Drop it in place of your current script.
 *
 * Recommended External Tool args:
 *  - Fresh  : "<ABS_PATH_TO_SCRIPT>" --fresh $FilePath$ $SelectedFiles$
 *  - Append : "<ABS_PATH_TO_SCRIPT>" --append $FilePath$ $SelectedFiles$
 *  - Clear  : "<ABS_PATH_TO_SCRIPT>" --clear
 *
 * This version:
 *  - Robustly parses WebStorm macros and combined tokens
 *  - Avoids splitting Windows drive letters (C:\)
 *  - Ignores literal macro tokens (e.g. "$SelectedFiles$")
 *  - Recurses directories and filters allowed extensions
 *  - Outputs prettier clipboard sections with colored filenames
 */

import fs from "fs";
import path from "path";
import os from "os";
import clipboardy from "clipboardy";
import chalk from "chalk";

// ---------- Configuration ----------
const allowedExtensions = [
    ".js", ".jsx", ".ts", ".tsx", ".json", ".css", ".scss", ".md", ".txt", ".env", ".tsx"
];

const SEPARATOR_LENGTH = 46; // smaller separator for paste readability

// ---------- Helpers ----------
function expandHome(p) {
    if (!p) return p;
    if (p.startsWith("~")) return path.join(os.homedir(), p.slice(1));
    return p;
}

function isLiteralMacroToken(token) {
    return typeof token === "string" && /^\$[A-Za-z0-9_]+\$$/.test(token);
}

function getFilesRecursively(dir) {
    const results = [];
    try {
        const list = fs.readdirSync(dir, { withFileTypes: true });
        for (const dirent of list) {
            const full = path.join(dir, dirent.name);
            if (dirent.isDirectory()) {
                results.push(...getFilesRecursively(full));
            } else if (allowedExtensions.includes(path.extname(dirent.name).toLowerCase())) {
                results.push(full);
            }
        }
    } catch (e) {
        // ignore inaccessible directories
    }
    return results;
}

// Normalize and split tokens into candidate paths.
// Handles space-separated, semicolon-separated, and colon-separated (but preserves "C:\")
function extractPathsFromToken(token) {
    if (!token || isLiteralMacroToken(token)) return [];

    // remove surrounding quotes
    let t = String(token).replace(/^["']|["']$/g, "").trim();
    if (!t) return [];

    // common case: WebStorm passed multiple paths separated by spaces.
    // Replace runs of whitespace with a single delimiter ';' first.
    // Replace semicolons with delimiter too. Then convert colons
    // that are NOT part of a Windows drive (i.e. not followed by backslash) to delimiter.
    // This keeps "C:\path" intact.
    // Example transforms:
    // "C:\a\b C:\c\d" -> "C:\a\b;C:\c\d"
    // "C:\a\b;C:\c\d" -> "C:\a\b;C:\c\d"
    // "path1:path2"   -> "path1;path2" (but won't split on "C:\")
    let normalized = t.replace(/\s+/g, ";");        // spaces -> ;
    normalized = normalized.replace(/;+/, ";");      // collapse multiple ;
    // Replace colon not followed by backslash with delimiter
    normalized = normalized.replace(/:(?!\\)/g, ";");

    const parts = normalized.split(";").map(p => p.trim()).filter(Boolean);
    return parts;
}

function formatFileSection(filePath) {
    const basename = path.basename(filePath);
    const coloredName = chalk.bold.cyan(basename);
    // build a short separator including filename
    const nameDisplay = ` ${coloredName} `;
    const dashCount = Math.max(4, SEPARATOR_LENGTH - nameDisplay.length);
    const left = "─".repeat(3);
    const right = "─".repeat(dashCount);
    const header = chalk.dim(`${left}${chalk.bold.white(nameDisplay)}${right}`);
    const contents = fs.readFileSync(filePath, "utf8").trim();
    const newFile = "//========================== NEW FILE  ==========================//";
    // Use comment prefix for small context (keep original style minimal)
    return `${newFile}\n${header}\n${contents}\n`;
}

// ---------- Main ----------
async function main() {
    try {
        const rawArgs = process.argv.slice(2);

        // parse flags and file-like tokens
        let mode = "append";
        const fileTokens = [];

        for (const raw of rawArgs) {
            const arg = String(raw).replace(/^["']|["']$/g, "").trim();
            if (!arg) continue;
            if (arg === "--fresh") {
                mode = "fresh";
                continue;
            }
            if (arg === "--append") {
                mode = "append";
                continue;
            }
            if (arg === "--clear") {
                await clipboardy.write("");
                console.log(chalk.green("🗑 Clipboard cleared."));
                return;
            }
            // otherwise collect token (may be single path or multiple paths glued)
            fileTokens.push(arg);
        }

        // expand tokens into concrete paths
        const inputPaths = [];
        for (const t of fileTokens) {
            const parts = extractPathsFromToken(t);
            for (const p of parts) {
                inputPaths.push(expandHome(p));
            }
        }

        if (inputPaths.length === 0) {
            console.error(chalk.red("❌ No files/folders detected. Make sure you select files and run the External Tool with $FilePath$ and/or $SelectedFiles$ in arguments."));
            return;
        }

        // Resolve inputPaths -> actual files (recurse directories)
        const allFiles = [];
        for (const ip of inputPaths) {
            try {
                const abs = path.resolve(ip);
                const stats = fs.statSync(abs);
                if (stats.isDirectory()) {
                    allFiles.push(...getFilesRecursively(abs));
                } else if (stats.isFile()) {
                    allFiles.push(abs);
                }
            } catch (e) {
                console.error(chalk.yellow(`⚠️ Cannot access ${ip}: ${e.message}`));
            }
        }

        if (allFiles.length === 0) {
            console.warn(chalk.yellow("⚠️ No readable files found (extensions filtered?)."));
            return;
        }

        // Read existing clipboard if append
        let clipboardContents = "";
        if (mode === "append") {
            try {
                clipboardContents = await clipboardy.read();
            } catch (_) {
                clipboardContents = "";
            }
        } else if (mode === "fresh") {
            // ensure empty before we add
            clipboardContents = "";
        }

        // Build pretty sections and append
        for (const f of allFiles) {
            try {
                clipboardContents += formatFileSection(f) + "\n";
            } catch (e) {
                console.error(chalk.yellow(`⚠️ Could not read ${f}: ${e.message}`));
            }
        }

        await clipboardy.write(clipboardContents);

        // Log summary
        console.log();
        console.log(chalk.green(`✅ ${mode === "append" ? "Updated" : "Copied"} ${allFiles.length} file(s) to clipboard.`));
        console.log(chalk.dim(`Mode: ${mode}`));
        console.log(chalk.gray("Files:"), allFiles.map(x => chalk.cyanBright(path.basename(x))).join(chalk.dim(", ")));
        console.log();
    } catch (err) {
        console.error(chalk.red("❌ Unexpected error:"), err && err.message ? err.message : err);
        process.exit(1);
    }
}

main();
