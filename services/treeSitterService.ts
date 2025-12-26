// @ts-ignore
import { Parser, Language } from 'web-tree-sitter';
import { safeLogger } from './securityUtils';
// @ts-ignore
import treeSitterWasmUrl from 'web-tree-sitter/web-tree-sitter.wasm?url';
// @ts-ignore
import pythonWasmUrl from 'tree-sitter-python/tree-sitter-python.wasm?url';
// @ts-ignore
import javaWasmUrl from 'tree-sitter-java/tree-sitter-java.wasm?url';
// @ts-ignore
import javascriptWasmUrl from 'tree-sitter-javascript/tree-sitter-javascript.wasm?url';
// @ts-ignore
import csharpWasmUrl from 'tree-sitter-c-sharp/tree-sitter-c_sharp.wasm?url';

// dt-sql-parser for SQL dialects
// @ts-ignore
import { MySQL, SparkSQL, FlinkSQL, HiveSQL, PostgreSQL } from 'dt-sql-parser';

// node-sql-parser for T-SQL (SQL Server)
// @ts-ignore
import { Parser as NodeSqlParser } from 'node-sql-parser';

export interface SyntaxError {
    message: string;
    line: number;
    column: number;
}

class TreeSitterService {
    // @ts-ignore
    private parser: Parser | null = null;
    // @ts-ignore
    private languages: Map<string, Language> = new Map();
    // @ts-ignore
    private oldTree: any | null = null;
    private initPromise: Promise<void> | null = null;

    // SQL Parsers (dt-sql-parser)
    private sqlParsers: Map<string, any> = new Map();
    // T-SQL Parser (node-sql-parser)
    // @ts-ignore
    private tsqlParser: NodeSqlParser;

    constructor() {
        this.init();
        this.initSqlParsers();
        // Initialize T-SQL parser
        this.tsqlParser = new NodeSqlParser();
    }

    private initSqlParsers() {
        // Initialize SQL parsers for different dialects
        this.sqlParsers.set('spark', new SparkSQL());
        this.sqlParsers.set('mysql', new MySQL());
        this.sqlParsers.set('postgresql', new PostgreSQL());
        this.sqlParsers.set('hive', new HiveSQL());
        this.sqlParsers.set('flink', new FlinkSQL());
        // Default SQL parser (use MySQL as it's most common)
        this.sqlParsers.set('sql', new MySQL());
        safeLogger.log("[TreeSitter] SQL parsers initialized");
    }

    async init() {
        if (this.initPromise) return this.initPromise;

        this.initPromise = (async () => {
            try {
                // Initialize web-tree-sitter with explicit WASM URL
                // @ts-ignore
                await Parser.init({
                    locateFile(scriptName: string, scriptDirectory: string) {
                        return treeSitterWasmUrl;
                    },
                });

                // @ts-ignore
                this.parser = new Parser();
                safeLogger.log("[TreeSitter] Core Initialized");
            } catch (e) {
                safeLogger.error("[TreeSitter] Failed to initialize core:", e);
            }
        })();
        return this.initPromise;
    }

    async loadLanguage(langName: string): Promise<Language | null> {
        await this.init();
        const normalized = langName.toLowerCase();

        if (this.languages.has(normalized)) {
            return this.languages.get(normalized)!;
        }

        try {
            let wasmUrl = null;
            if (normalized.includes('python')) wasmUrl = pythonWasmUrl;
            else if (normalized.includes('java') && !normalized.includes('script')) wasmUrl = javaWasmUrl;
            else if (normalized.includes('javascript') || normalized.includes('js')) wasmUrl = javascriptWasmUrl;
            else if (normalized.includes('csharp') || normalized.includes('c#')) wasmUrl = csharpWasmUrl;

            if (!wasmUrl) return null; // Unsupported language

            // @ts-ignore
            const lang = await Language.load(wasmUrl);
            this.languages.set(normalized, lang);
            safeLogger.log(`[TreeSitter] Loaded ${normalized}`);
            return lang;
        } catch (e) {
            safeLogger.error(`[TreeSitter] Failed to load ${normalized}:`, e);
            return null;
        }
    }

    /**
     * Get the appropriate SQL parser for the given dialect
     * Returns: 
     * - dt-sql-parser instance (has validate() method)
     * - OR 'tsql' string identifier for node-sql-parser
     * - OR null if not supported
     */
    private getSqlParser(language: string): any | string | null {
        const normalized = language.toLowerCase();

        if (normalized.includes('spark')) return this.sqlParsers.get('spark');
        if (normalized.includes('hive')) return this.sqlParsers.get('hive');
        if (normalized.includes('flink')) return this.sqlParsers.get('flink');
        if (normalized.includes('postgresql') || normalized.includes('postgres')) return this.sqlParsers.get('postgresql');
        if (normalized.includes('mysql')) return this.sqlParsers.get('mysql');

        // Match SQL Server (T-SQL)
        if (normalized.includes('sql server') || normalized.includes('tsql')) {
            return 'tsql';
        }

        return null;
    }

    /**
     * Validate SQL using dt-sql-parser or node-sql-parser (for T-SQL)
     */
    private validateSql(code: string, language: string): SyntaxError | null {
        const parser = this.getSqlParser(language);
        if (!parser) return null;

        try {
            // Case 1: T-SQL (node-sql-parser)
            if (parser === 'tsql') {
                try {
                    // node-sql-parser throws on error
                    // @ts-ignore
                    const ast: any[] | any = this.tsqlParser.astify(code, { database: 'transactsql' });

                    // Manual check for LIMIT (not supported in T-SQL, use TOP)
                    const queries = Array.isArray(ast) ? ast : [ast];
                    for (const q of queries) {
                        if (q.limit) {
                            return {
                                message: "LIMIT is not supported in SQL Server (T-SQL). Use 'SELECT TOP n' instead.",
                                line: q.limit.value && q.limit.value[0] && q.limit.value[0].type === 'number' ? 1 : 1,
                                column: 1
                            };
                        }
                    }

                    return null;
                } catch (err: any) {
                    // Extract error details
                    if (err.location) {
                        return {
                            message: err.message || "T-SQL Syntax Error",
                            line: err.location.start.line,
                            column: err.location.start.column
                        };
                    }
                    return {
                        message: "Syntax Error",
                        line: 1,
                        column: 1
                    };
                }
            }

            // Case 2: Standard dt-sql-parser (Spark, MySQL, etc)
            // @ts-ignore
            const errors = parser.validate(code);

            if (errors && errors.length > 0) {
                const firstError = errors[0];
                return {
                    message: firstError.message || "SQL Syntax Error",
                    line: firstError.startLine || 1,
                    column: firstError.startCol || 1
                };
            }
            return null; // No errors

        } catch (e) {
            safeLogger.error(`[TreeSitter] SQL validation failed for ${language}:`, e);
            return null;
        }
    }

    /**
     * Check if the language is a SQL dialect
     */
    private isSqlLanguage(language: string): boolean {
        const normalized = language.toLowerCase();
        return normalized.includes('sql') ||
            normalized.includes('spark') ||
            normalized.includes('snowflake') ||
            normalized.includes('hive') ||
            normalized.includes('flink');
    }

    /**
     * incrementalParse: 
     * Uses Tree-sitter's incremental parsing capability.
     * Returns true if syntax is valid, false if invalid.
     * Returns a list of syntax errors.
     */
    async validate(code: string, language: string = 'python'): Promise<SyntaxError | null> {
        const normalized = language.toLowerCase();

        // Use dt-sql-parser for SQL dialects
        if (this.isSqlLanguage(normalized)) {
            return this.validateSql(code, normalized);
        }

        // Use Tree-sitter for other languages
        await this.init();
        if (!this.parser) return null;

        const langInstance = await this.loadLanguage(language);
        if (!langInstance) return null; // Skip validation for unsupported langs

        try {
            // @ts-ignore
            this.parser.setLanguage(langInstance);

            // Perform incremental parse if we have an old tree
            // @ts-ignore
            const tree = this.parser.parse(code); // Always do fresh parse for stability
            this.oldTree = tree; // cache for next time (even if unused for now)

            // @ts-ignore
            if (tree.rootNode.hasError) {
                // Find the first error node
                const errorNode = this.findFirstError(tree.rootNode);
                if (errorNode) {
                    return {
                        message: "Syntax Error",
                        // @ts-ignore
                        line: errorNode.startPosition.row + 1, // 1-based
                        // @ts-ignore
                        column: errorNode.startPosition.column + 1
                    };
                }
                return { message: "Syntax Error", line: 1, column: 1 };
            }
        } catch (e) {
            safeLogger.error("[TreeSitter] Validation check failed", e);
        }

        return null;
    }

    /**
     * Public parse method for consumers (e.g. LogicMapService)
     */
    async parse(code: string, language: string): Promise<any | null> {
        await this.init();
        const langInstance = await this.loadLanguage(language);
        if (!langInstance || !this.parser) return null;

        // @ts-ignore
        this.parser.setLanguage(langInstance);
        // @ts-ignore
        return this.parser.parse(code);
    }

    // @ts-ignore
    private findFirstError(node: any): any | null {
        // @ts-ignore
        if (node.type === 'ERROR' || node.isMissing) return node;

        // @ts-ignore
        for (const child of node.children) {
            // @ts-ignore
            if (child.hasError) {
                const found = this.findFirstError(child);
                if (found) return found;
            }
        }
        return null;
    }
}

export const treeSitterService = new TreeSitterService();
