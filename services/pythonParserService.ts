/**
 * Python 3 Parser Service using Brython
 * Supports Python 3.10+ syntax (match/case, etc.)
 * Pure JavaScript - transpiles Python to JS to check syntax
 */

// Brython is loaded via <script> tag in index.html to avoid ESM issues
// import 'brython/brython.js';

// Define Brython global types
declare global {
    interface Window {
        __BRYTHON__: {
            py2js: (src: string, module_name: string) => any;
            updated_src?: string;
        }
    }
}

export interface SyntaxError {
    message: string;
    line: number;
    column: number;
}

export interface ParseResult {
    valid: boolean;
    error: SyntaxError | null;
    ast: any | null;
}

class PythonParserService {

    constructor() {
        // Brython initializes on import and attaches to window.__BRYTHON__
    }

    /**
     * Check Python 3 syntax using Brython.
     * Returns null if valid, or error details if invalid.
     */
    checkSyntax(code: string): SyntaxError | null {
        if (!code || !code.trim()) {
            return null;
        }

        try {
            // Using internal API to transpile - if it fails, it throws SyntaxError
            if (typeof window !== 'undefined' && window.__BRYTHON__ && window.__BRYTHON__.py2js) {
                window.__BRYTHON__.py2js(code, "main");
            } else {
                // Warn only once or use a flag to avoid console spam
                // console.warn("Brython not fully initialized");
                return null;
            }

            return null; // Valid syntax
        } catch (e: any) {
            // Brython error object structure varies but usually has info

            // Default values
            let message = "Syntax Error";
            let line = 1;
            let column = 0;

            // 1. Try standard properties
            if (e.lineNumber !== undefined) line = e.lineNumber;
            if (e.lineno !== undefined) line = e.lineno;

            // 2. Try Brython specific fields
            if (e.msg) message = e.msg;
            if (e.args) {
                if (Array.isArray(e.args) && e.args.length > 0) {
                    message = e.args[0];
                }
            }

            // 3. Fallback string parsing
            const errStr = String(e);
            if (line === 1 && errStr.includes("line")) {
                const match = errStr.match(/line (\d+)/);
                if (match) line = parseInt(match[1]);
            }

            // Normalization
            if (message === "bad input") message = "Invalid valid syntax";

            // Heuristic: Last line filtering for incomplete code
            const lines = code.split('\n');
            const totalLines = lines.length;
            if (line >= totalLines) {
                const lastLine = lines[lines.length - 1].trim();
                // Incomplete constructs check
                if (lastLine.endsWith('=') || lastLine.endsWith(':') ||
                    lastLine.endsWith('(') || lastLine.endsWith('[') ||
                    lastLine.endsWith('{') ||
                    // Check for keywords that start blocks
                    lastLine.match(/^(if|elif|else|for|while|def|class|match|case|with|try|except|finally)\b/)) {

                    // If it really looks incomplete, ignore error
                    return null;
                }
            }

            return {
                message: message,
                line: line,
                column: column
            };
        }
    }

    /**
     * Parse code (AST not fully supported via same API)
     */
    parse(code: string): ParseResult {
        const error = this.checkSyntax(code);
        return {
            valid: !error,
            error: error,
            ast: null
        };
    }
}

export const pythonParserService = new PythonParserService();
