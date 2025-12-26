
import { parse, walk } from '@kriss-u/py-ast';
// Configure Mermaid - NOT IN SERVICE
// Service should act as a pure logic parser/generator


export class LogicMapService {

    /**
     * Map Python Source -> Mermaid SVG
     */
    async generateDiagram(code: string, language: string = 'python'): Promise<string> {
        try {
            console.log('[LogicMapService] Generating diagram (v3 - Try Fix + Debug Colors)');

            // Default Init
            let initConfig = {
                "flowchart": { "defaultRenderer": "elk", "nodeSpacing": 50, "rankSpacing": 50 },
                "maxTextSize": 500000
            };

            // Universal Theme Overrides (Transparent Clusters)
            // @ts-ignore
            initConfig["themeVariables"] = {
                "clusterBkg": "transparent",
                "clusterBorder": "transparent",
                "mainBkg": "transparent",
                "nodeBkg": "transparent"
            };

            let mm = `%%{init: ${JSON.stringify(initConfig)} }%%\nflowchart TD\n`;
            let nodeIdCounter = 0;
            const newId = () => `n${nodeIdCounter++}`;

            // === 1. SANITIZATION LAYER ===
            // Mandatory Character Escape Map (Table 1)
            const sanitizeLabel = (rawCode: string): string => {
                if (!rawCode) return "";

                // 1. Normalize Whitespace (Collapse spaces, trim)
                let clean = rawCode.replace(/\s+/g, " ").trim();

                // 2. Truncate (Max 50 chars)
                const MAX_LEN = 50;
                if (clean.length > MAX_LEN) {
                    clean = clean.substring(0, MAX_LEN) + "...";
                }

                // 3. Minimal Escape (Prevent syntax break but keep readability)
                // Replace double quotes with single quotes to avoid string breakout
                clean = clean.replace(/"/g, "'");

                // Escape HTML tags to prevent rendering issues in DOM
                clean = clean.replace(/&/g, "&amp;");
                clean = clean.replace(/</g, "&lt;");
                clean = clean.replace(/>/g, "&gt;");

                // Escape Backslashes
                clean = clean.replace(/\\/g, "\\\\");

                // Allow ( ) [ ] { } ; # as they are safe inside quoted strings in modern Mermaid/ELK
                return clean;
            };

            // Legacy Escape compatibility (Redirect to sanitizeLabel)
            const esc = (txt: string) => sanitizeLabel(txt);

            // === STRATEGY 1: PYTHON (legacy py-ast) ===
            const sourceLines = code.split(/\r?\n/);
            const getLine = (row: number) => {
                const line = sourceLines[row - 1] || "";
                return line.trim();
            };
            // Legacy safeLabel wrapper for Python strategy
            const safeLabel = (txt: string, fallback: string = "Step") => {
                const sanitized = sanitizeLabel(txt || fallback);
                return sanitized === "" ? sanitizeLabel(fallback) : sanitized;
            };

            if (language.toLowerCase().includes('python')) {
                // Workaround: py-ast may not support f-strings, replace f"..." with "..." for PARSING only
                // We leave the original 'code' intact for label extraction (getLine)
                const parseCode = code
                    .replace(/f"/g, '"')
                    .replace(/f'/g, "'");

                let ast;
                try {
                    ast = parse(parseCode);
                } catch (e) {
                    console.warn("Python AST Parse failed, fallback to raw lines?", e);
                    ast = { body: [] };
                }

                // Reuse existing recursive builder
                // Returns { start: string | null, end: string | null }
                const processBlock = (stmts: any[], prevId: string | null): { start: string | null, end: string | null } => {
                    let currentPrev = prevId;
                    let firstNodeId: string | null = null;

                    for (const node of stmts) {
                        const line = node.lineno || 0;
                        const id = `L${line}_${nodeIdCounter++}`; // Unique ID
                        const type = node.nodeType || node.constructor.name;
                        let nodeDef = "";
                        let isTerminal = false;
                        const content = getLine(line) || type;
                        const label = safeLabel(content);

                        if (!firstNodeId) firstNodeId = id;

                        // Note: Quotes must be directly adjacent to shape delimiters (no spaces)
                        switch (type) {
                            case 'FunctionDef':
                                nodeDef = `${id}(["${label}"])`; // Stadium
                                break;
                            case 'If':
                                nodeDef = `${id}{"${label}"}`; // Rhombus
                                break;
                            case 'For':
                            case 'While':
                                nodeDef = `${id}{{"${label}"}}`; // Hexagon
                                break;
                            case 'Return':
                                nodeDef = `${id}(("${label}"))`; // Circle/DoubleCircle
                                isTerminal = true;
                                break;
                            case 'Try':
                            case 'TryStatement': // Defensive check
                                nodeDef = `${id}>"${label}"]`; // Flag/Asymmetric
                                break;
                            case 'ExceptHandler':
                                const exType = node.type ? (node.type.name || 'Except') : 'Except';
                                nodeDef = `${id}(["Except: ${exType}"])`;
                                break;
                            case 'Assign':
                                nodeDef = `${id}["${label}"]`; // Rect
                                break;
                            case 'Expr':
                                // Skip Docstrings (String Constants)
                                if (node.value && (node.value.nodeType === 'Constant' || node.value.nodeType === 'Str')) {
                                    if (typeof node.value.value === 'string') {
                                        // It's a docstring/string literal -> SKIP
                                        continue;
                                    }
                                }
                                nodeDef = `${id}["${label}"]`; // Rect
                                break;
                            case 'Call':
                                nodeDef = `${id}["${label}"]`; // Rect
                                break;
                            default:
                                nodeDef = `${id}["${label}"]`;
                        }

                        // Add Node
                        mm += `  ${nodeDef}\n`;

                        // Add Link (Generic)
                        // ONLY link if currentPrev (from sequence) is valid, AND we didn't just mistakenly link self
                        if (currentPrev && currentPrev !== id) {
                            // Helper to clean ID
                            const prevIdClean = currentPrev.split(/[\{\[\(\>\/]/)[0].trim();
                            const currIdClean = nodeDef.split(/[\{\[\(\>\/]/)[0].trim();
                            mm += `  ${prevIdClean} --> ${currIdClean}\n`;
                        }

                        // Recursion (Enhanced)
                        if (type === 'If') {
                            let mergeId = `M${newId()}`;
                            let thenExit = id;
                            let elseExit = id;

                            // Process Body (Pass null to prevent generic link, we handle labeled link)
                            if (node.body) {
                                const thenResult = processBlock(node.body, null);
                                if (thenResult.start) {
                                    const startClean = thenResult.start.split(/[\{\[\(\>\/]/)[0].trim();
                                    mm += `  ${id} -- Yes --> ${startClean}\n`;
                                } else {
                                    // Empty body? Link directly to merge if needed, or handle below
                                    mm += `  ${id} -- Yes --> ${mergeId}\n`;
                                }
                                if (thenResult.end) thenExit = thenResult.end;
                            } else {
                                mm += `  ${id} -- Yes --> ${mergeId}\n`;
                            }

                            // Process Else
                            if (node.orelse && node.orelse.length > 0) {
                                const elseResult = processBlock(node.orelse, null);
                                if (elseResult.start) {
                                    const startClean = elseResult.start.split(/[\{\[\(\>\/]/)[0].trim();
                                    mm += `  ${id} -- No --> ${startClean}\n`;
                                } else {
                                    mm += `  ${id} -- No --> ${mergeId}\n`;
                                }
                                if (elseResult.end) elseExit = elseResult.end;
                            } else {
                                mm += `  ${id} -- No --> ${mergeId}\n`;
                            }

                            // Merge point
                            mm += `  ${mergeId}(( ))\n`;

                            // Link exits to merge
                            const thenClean = thenExit.split(/[\{\[\(\>\/]/)[0].trim();
                            const elseClean = elseExit.split(/[\{\[\(\>\/]/)[0].trim();

                            if (thenExit !== id) mm += `  ${thenClean} --> ${mergeId}\n`;
                            if (elseExit !== id) mm += `  ${elseClean} --> ${mergeId}\n`;

                            currentPrev = mergeId;
                        }
                        else if (type === 'For' || type === 'While') {
                            if (node.body) {
                                const bodyRes = processBlock(node.body, id);
                                if (bodyRes.end) {
                                    const exitClean = bodyRes.end.split(/[\{\[\(\>\/]/)[0].trim();
                                    mm += `  ${exitClean} --> ${id}\n`; // Loop back
                                }
                            }
                            currentPrev = id; // Loop flows to next
                        }
                        else if (type === 'FunctionDef') {
                            if (node.body) processBlock(node.body, id);
                            currentPrev = id;
                        }
                        else if (type === 'Try') {
                            let bodyEnd = id;
                            let activeEnds: string[] = [];

                            // 1. Try Body
                            if (node.body) {
                                const bodyRes = processBlock(node.body, id);
                                if (bodyRes.end) bodyEnd = bodyRes.end;
                            }

                            // 2. Try-Else (Runs if NO exception)
                            // Links from end of Body
                            let elseEnd = bodyEnd;
                            if (node.orelse && node.orelse.length > 0) {
                                const elseRes = processBlock(node.orelse, bodyEnd);
                                if (elseRes.end) elseEnd = elseRes.end;
                            }
                            activeEnds.push(elseEnd);

                            // 3. Handlers (Exception Paths)
                            // Linked from Try-start (conceptually)
                            if (node.handlers) {
                                for (const handler of node.handlers) {
                                    const hLine = handler.lineno || line;
                                    const hId = `L${hLine}_${nodeIdCounter++}`;
                                    const exName = handler.type ? (handler.type.name || 'Exception') : 'Except';
                                    const hDef = `${hId}>"Except: ${exName}"]`;
                                    mm += `  ${hDef}\n`;
                                    mm += `  ${id} -.-> ${hId}\n`; // Dotted link for exception

                                    if (handler.body) {
                                        const hRes = processBlock(handler.body, hId);
                                        if (hRes.end) activeEnds.push(hRes.end);
                                        else activeEnds.push(hId);
                                    } else {
                                        activeEnds.push(hId);
                                    }
                                }
                            }

                            // 4. Finally (Runs after Else OR Handlers)
                            if (node.finalbody && node.finalbody.length > 0) {
                                const finId = `L${node.finalbody[0].lineno}_${nodeIdCounter++}`;
                                const finStart = `${finId}{{Finally}}`; // Hexagon or similar
                                mm += `  ${finStart}\n`;

                                // Link all active paths to Finally
                                for (const endPoint of activeEnds) {
                                    const endClean = endPoint.split(/[\{\[\(\>\/]/)[0].trim();
                                    mm += `  ${endClean} --> ${finId}\n`;
                                }

                                // Process Finally Body
                                const finRes = processBlock(node.finalbody, finId);
                                currentPrev = finRes.end || finId;
                            } else {
                                // No finally: Conceptual merge or just leave tails?
                                // For linear flow, we usually follow the 'Success' path (Else)
                                currentPrev = elseEnd;
                            }
                        }
                        else {
                            currentPrev = id;
                        }
                        if (isTerminal) currentPrev = null;
                    }
                    return { start: firstNodeId, end: currentPrev };
                };

                if (ast.body) processBlock(ast.body, null);
            }

            // === STRATEGY 2: JAVA (Tree-sitter) ===
            else if (language.toLowerCase().includes('java') && !language.toLowerCase().includes('script')) {
                const { treeSitterService } = await import('./treeSitterService');
                const tree = await treeSitterService.parse(code, 'java');
                if (!tree) return "";

                // Tree-sitter recursive walker with Flattening & Normalization
                const processNode = (cursor: any, prevId: string | null): string | null => {
                    let currentPrev = prevId;
                    const children = cursor.children || [];

                    for (const node of children) {
                        if (!node.isNamed) continue;

                        // NEW: Line-based ID generation for Highlighting
                        const line = (node.startPosition ? node.startPosition.row : 0) + 1;
                        const id = `L${line}_${nodeIdCounter++}`;
                        const type = node.type;
                        let nodeDef = "";
                        let isTerminal = false;

                        // NEW: Label from Source Code
                        const content = getLine(line) || type;
                        let label = safeLabel(content);

                        switch (type) {
                            case 'class_declaration':
                                const classNameItem = node.childForFieldName('name');
                                const className = classNameItem ? classNameItem.text : 'Class';
                                nodeDef = `subgraph ${id} ["Class: ${sanitizeLabel(className)}"]\n`;
                                const body = node.childForFieldName('body');
                                if (body) processNode(body, null);
                                nodeDef += `end\n`;
                                mm += nodeDef;
                                currentPrev = null;
                                continue;

                            case 'method_declaration':
                                const methodItem = node.childForFieldName('name');
                                label = methodItem ? methodItem.text : 'Method';
                                nodeDef = `${id}([Method: ${sanitizeLabel(label)}])`;
                                mm += `  ${nodeDef}\n`;
                                if (currentPrev) mm += `  ${currentPrev} --> ${id}\n`;

                                // Recursively process the method body
                                const methodBody = node.childForFieldName('body');
                                if (methodBody) {
                                    const bodyExit = processNode(methodBody, id);
                                    // Flow ends at the last node of the body (or explicit returns)
                                    // We don't necessarily link back to anything unless it's a call
                                    currentPrev = bodyExit;
                                } else {
                                    currentPrev = id;
                                }
                                continue; // Continued recursion managed currentPrev

                            // Try-With-Resources (Java Specific)
                            case 'try_with_resources_statement':
                                const resources = node.childForFieldName('resources');
                                const tryBody = node.childForFieldName('body');

                                // 1. Resource Init Node
                                const resId = `L${line}_${nodeIdCounter++}`;
                                let resLabel = "Init Resources";
                                if (resources) {
                                    const resText = resources.text.replace(/\n/g, ' ').substring(0, 30);
                                    resLabel = `Resources: ${sanitizeLabel(resText)}`;
                                }
                                mm += `  ${resId}[${resLabel}]\n`;
                                if (currentPrev) mm += `  ${currentPrev} --> ${resId}\n`;
                                currentPrev = resId;

                                // 2. Process Body
                                const exitNode = processNode(tryBody, resId);

                                // 3. Auto-Close (Implicit Finally)
                                const closeId = `L${line}_${nodeIdCounter++}`;
                                mm += `  ${closeId}[Auto-Close Resources]\n`;

                                if (exitNode) mm += `  ${exitNode} --> ${closeId}\n`;
                                else mm += `  ${currentPrev} --> ${closeId}\n`;

                                currentPrev = closeId;
                                continue;

                            // NEW: Standard Try Statement
                            case 'try_statement':
                                const tBody = node.childForFieldName('body');
                                // Process Try Body
                                const tExit = processNode(tBody, currentPrev);

                                // Process Catch Clauses (if any)
                                // Note: Tree-sitter Java has catch_clause children. 
                                // We iterate children again to find catch/finally since they are not just single fields
                                // But simple approach: iterate named children of the try_statement
                                let tryFlowEnd = tExit || currentPrev;

                                // We need a merge point for after try/catch
                                const tryMergeId = `M_${id}`;
                                mm += `  ${tryMergeId}(( ))\n`;

                                // Link Try Body to Merge (Success path)
                                if (tExit) mm += `  ${tExit} --> ${tryMergeId}\n`;

                                // Catch Blocks
                                // Tree-sitter: catch_clause appears as children, not a single field list
                                for (const child of node.children) {
                                    if (child.type === 'catch_clause') {
                                        const cParams = child.childForFieldName('parameters'); // e.g. (Exception e)
                                        const cBody = child.childForFieldName('body');

                                        // Catch Start Node (from Try Start?) 
                                        // Actually logic flows from inside Try to Catch on error. 
                                        // Visualizing exact error points is hard.
                                        // Standard Flowchart: Dotted line from Try-block to Catch-block

                                        const catchId = `L${child.startPosition.row + 1}_${nodeIdCounter++}`;
                                        const catchLabel = cParams ? sanitizeLabel(cParams.text) : "Catch";
                                        mm += `  ${catchId}([${catchLabel}])\n`;

                                        // Link from Try Start (or Body Start) to Catch
                                        // We use the ID of the Try Statement itself or previous?
                                        // If we don't have a specific Try Header node, we use currentPrev (entry to Try).
                                        if (currentPrev) mm += `  ${currentPrev} -. Exception .-> ${catchId}\n`;

                                        // Process Catch Body
                                        const cExit = processNode(cBody, catchId);
                                        if (cExit) mm += `  ${cExit} --> ${tryMergeId}\n`;
                                        else mm += `  ${catchId} --> ${tryMergeId}\n`;
                                    }
                                }

                                // Finally Block
                                const finalClause = node.childForFieldName('finalizer');
                                if (finalClause) {
                                    const fBody = finalClause.childForFieldName('body');
                                    // Finally comes AFTER the merge of Try/Catch
                                    const finallyId = `L${finalClause.startPosition.row + 1}_${nodeIdCounter++}`;
                                    mm += `  ${finallyId}{{"Finally"}}\n`;
                                    mm += `  ${tryMergeId} --> ${finallyId}\n`;

                                    const fExit = processNode(fBody, finallyId);
                                    currentPrev = fExit || finallyId;
                                } else {
                                    currentPrev = tryMergeId;
                                }
                                continue;

                            case 'if_statement':
                                // If-Else Flattening Logic
                                // We check if this 'if' is currently the 'alternative' of a parent 'if'.
                                // BUT: since we are iterating children, the parent logic handles the linking.
                                // Here we just need to detect if *our* alternative is an 'if_statement' to handle the chain visual.

                                const condition = node.childForFieldName('condition');
                                const condText = condition ? sanitizeLabel(condition.text) : 'Condition';
                                // Diamond Shape
                                nodeDef = `${id}{"${condText}"}`;
                                mm += `  ${nodeDef}\n`;
                                if (currentPrev) mm += `  ${currentPrev} --> ${id}\n`;

                                // Branches
                                const thenBlock = node.childForFieldName('consequence');
                                const elseBlock = node.childForFieldName('alternative');

                                const mergeId = `M_${id}`; // Deterministic merge ID
                                mm += `  ${mergeId}(( ))\n`;

                                // THEN Path
                                if (thenBlock) {
                                    const thenExit = processNode(thenBlock, id); // Pass id as prev 
                                    const linkStart = id; // The diamond
                                    // Manually link diamond -> first node of block is tricky if processNode auto-links
                                    // Actually processNode links prevId -> firstNode. 
                                    // So we just need to link thenExit -> mergeId
                                    // BUT: processNode adds the link `id --> thenFirst`. We need to label it "Yes"

                                    // To label edges, we need to intercept the first link or use a temporary node?
                                    // Easiest: Let processNode link, but we can't easily label it "Yes" afterwards without interception.
                                    // Better: We manually emit the "Yes" edge to the first node of ThenBlock, 
                                    // but processNode expects a prevId to link *to*.

                                    // Hack: We pass 'null' as prevId to processNode so it doesn't link.
                                    // Then we manually link id -- Yes --> thenFirst.
                                    // But processNode returns the *last* node. We don't know the *first*.

                                    // Refined Approach similar to Python strategy:
                                    // We need the first structural node ID from the block.
                                    // Since we can't get it easily without refactoring processNode to return {first, last},
                                    // We will stick to standard arrows for now, or use a dummy node.

                                    // Optimization: Just use standard arrows. Labels like "Yes/No" often clutter big graphs.
                                    // Logic flow is usually Right/Down for Yes, and Left/Down for No.
                                    if (thenExit) mm += `  ${thenExit} --> ${mergeId}\n`;
                                    else mm += `  ${id} --> ${mergeId}\n`; // Empty block
                                }

                                // ELSE Path
                                if (elseBlock) {
                                    // Flattening: If elseBlock is just another IF, we link directly to it.
                                    if (elseBlock.type === 'if_statement') {
                                        // This is an "Else If"
                                        // We treat the *next* IF iteration as the "first node" of the else block.
                                        const elseExit = processNode(elseBlock, id);
                                        if (elseExit) mm += `  ${elseExit} --> ${mergeId}\n`;
                                    } else {
                                        const elseExit = processNode(elseBlock, id);
                                        if (elseExit) mm += `  ${elseExit} --> ${mergeId}\n`;
                                        else mm += `  ${id} --> ${mergeId}\n`;
                                    }
                                } else {
                                    // No Else -> Link Diamond directly to Merge
                                    mm += `  ${id} --> ${mergeId}\n`;
                                }

                                currentPrev = mergeId;
                                continue; // Handled manually

                            case 'while_statement':
                            case 'for_statement':
                                // Standardize Loop Label: Use the exact source code line (e.g., "for(int i=0...)")
                                // This ensures consistency with the Python strategy and enables variable injection.
                                let loopLabel = getLine(line) || (type === 'for_statement' ? 'For Loop' : 'While Loop');

                                // Hexagon for Loop
                                nodeDef = `${id}{{"${sanitizeLabel(loopLabel)}"}}`;
                                mm += `  ${nodeDef}\n`;
                                if (currentPrev) mm += `  ${currentPrev} --> ${id}\n`;

                                const bodyL = node.childForFieldName('body');
                                if (bodyL) {
                                    // Process body, linking from Loop Node
                                    const bodyExit = processNode(bodyL, id);
                                    // Explicit Back-Edge
                                    if (bodyExit) {
                                        mm += `  ${bodyExit} -- Repeat --> ${id}\n`;
                                    }
                                }
                                currentPrev = id; // Flow continues from loop (condition fail)
                                continue;

                            case 'return_statement':
                                nodeDef = `${id}(("Return"))`;
                                isTerminal = true;
                                break;

                            case 'expression_statement':
                            case 'local_variable_declaration':
                                // Label comes from 'content' (source line) via getLine()
                                nodeDef = `${id}["${label}"]`;
                                break;

                            default:
                                continue;
                        }

                        if (nodeDef && !nodeDef.startsWith('subgraph')) {
                            mm += `  ${nodeDef}\n`;
                            // Standard linking for non-control-flow nodes
                            if (currentPrev) {
                                const prevClean = currentPrev.split(/[\{\[\(\>\/]/)[0].trim();
                                const currClean = nodeDef.split(/[\{\[\(\>\/]/)[0].trim();
                                mm += `  ${prevClean} --> ${currClean}\n`;
                            }
                        }

                        // Normal linear flow update
                        if (isTerminal) currentPrev = null;
                        else currentPrev = id;
                    }
                    return currentPrev;
                };

                processNode(tree.rootNode, null);
            }

            // === STRATEGY 3: JAVASCRIPT / TYPESCRIPT (Esprima - ROBUST) ===
            else if (language.toLowerCase().includes('javascript') || language.toLowerCase().includes('js') || language.toLowerCase().includes('typescript') || language.toLowerCase().includes('ts')) {
                // Use Esprima for robust parsing (no WASM failures)
                const esprima = await import('esprima');
                console.log("[LogicMap] Using Esprima Parser Strategy");

                // --- STRICT SANITIZER (JS ONLY) ---
                const sanitizeLabelStrict = (rawCode: string): string => {
                    if (!rawCode) return "";
                    let clean = rawCode.replace(/\s+/g, " ").trim();
                    // Tighter truncation (30 chars) to prevent wide nodes
                    if (clean.length > 30) clean = clean.substring(0, 30) + "...";

                    // Unicode Homoglyph Substitution (Fullwidth Characters) - NATIVE INJECTION
                    // We use \uXXXX directly to insert the character code, preventing backslash collisions.
                    clean = clean.replace(/&/g, "\uFF06"); // ＆
                    clean = clean.replace(/</g, "\uFF1C"); // ＜
                    clean = clean.replace(/>/g, "\uFF1E"); // ＞
                    clean = clean.replace(/"/g, "\uFF02"); // ＂
                    clean = clean.replace(/'/g, "\uFF07"); // ＇
                    clean = clean.replace(/\(/g, "\uFF08"); // （
                    clean = clean.replace(/\)/g, "\uFF09"); // ）
                    clean = clean.replace(/\[/g, "\uFF3B"); // ［
                    clean = clean.replace(/\]/g, "\uFF3D"); // ］
                    clean = clean.replace(/\{/g, "\uFF5B"); // ｛
                    clean = clean.replace(/\}/g, "\uFF5D"); // ｝
                    clean = clean.replace(/;/g, "\uFF1B"); // ；
                    clean = clean.replace(/#/g, "\uFF03"); // ＃

                    // NEW DETECTED BREAKERS (Aggressive Substitution)
                    clean = clean.replace(/\|/g, "\uFF5C"); // ｜ (Fixes || crash)
                    clean = clean.replace(/%/g, "\uFF05");  // ％
                    clean = clean.replace(/@/g, "\uFF20");  // ＠
                    clean = clean.replace(/:/g, "\uFF1A");  // ：
                    clean = clean.replace(/\^/g, "\uFF3E"); // ＾

                    clean = clean.replace(/\\/g, "\uFF3C"); // ＼
                    return clean;
                };

                try {
                    // 1. Parse
                    const program = esprima.parseScript(code, { loc: true, range: true, tokens: true });
                    console.log("[LogicMap] Esprima Logic Tree Nodes:", program?.body?.length);

                    if (!program || !program.body) return "";

                    // 2. Recursive Processor for ESTree Nodes
                    let currentPrev: string | null = null;

                    const processEsprimaNode = (node: any, prevId: string | null): string | null => {
                        if (!node) return prevId;

                        // Handle formatting
                        // We use the same line-based ID strategy: L{line}_{counter}
                        const line = node.loc ? node.loc.start.line : 0;
                        const id = `L${line}_${nodeIdCounter++}`;

                        // Helper to get source text
                        const getSource = (n: any) => {
                            if (n.range) return code.substring(n.range[0], n.range[1]);
                            return "";
                        };

                        // Use line content for clean labels, fallback to source snippet
                        let label = sanitizeLabelStrict(getLine(line) || getSource(node));

                        // --- Logic by Node Type ---

                        // 1. BlockStatement / Program Body
                        if (node.type === 'BlockStatement' || node.type === 'Program') {
                            let lastExit = prevId;
                            for (const child of node.body) {
                                lastExit = processEsprimaNode(child, lastExit);
                            }
                            return lastExit;
                        }

                        // 2. Function Declaration (Sync/Async)
                        if (node.type === 'FunctionDeclaration') {
                            const funcName = node.id ? node.id.name : 'anonymous';
                            const isAsync = node.async ? 'Async ' : '';

                            // Flat Node Strategy (Stadium)
                            const headerId = `${id}_Header`;
                            mm += `  ${headerId}([${isAsync}Func: ${funcName}])\n`;
                            if (prevId) mm += `  ${prevId} -.-> ${headerId}\n`;

                            // Link into body
                            if (node.body) {
                                processEsprimaNode(node.body, headerId);
                            }

                            return headerId;
                        }

                        // 3. If Statement
                        if (node.type === 'IfStatement') {
                            // Condition
                            let testCode = getSource(node.test);
                            if (testCode.length > 40) testCode = testCode.substring(0, 37) + "...";

                            mm += `  ${id}{${sanitizeLabelStrict(testCode)}}\n`;
                            if (prevId) mm += `  ${prevId} --> ${id}\n`;

                            // True Path
                            const trueParams = processEsprimaNode(node.consequent, id);

                            // False Path
                            let falseParams = null;
                            if (node.alternate) {
                                falseParams = processEsprimaNode(node.alternate, id);
                            }

                            // Merge
                            const mergeId = `M_${id}`;
                            mm += `  ${mergeId}(( ))\n`;

                            // Link True exit -> Merge
                            if (trueParams) mm += `  ${trueParams} --> ${mergeId}\n`;
                            else mm += `  ${id} -- Yes --> ${mergeId}\n`;

                            // Link False exit -> Merge
                            if (falseParams) mm += `  ${falseParams} --> ${mergeId}\n`;
                            else mm += `  ${id} -- No --> ${mergeId}\n`;

                            return mergeId;
                        }

                        // 4. Loops (While)
                        if (node.type === 'WhileStatement') {
                            const testCode = getSource(node.test);
                            mm += `  ${id}{{While: ${sanitizeLabelStrict(testCode)}}} \n`;
                            if (prevId) mm += `  ${prevId} --> ${id}\n`;

                            const bodyExit = processEsprimaNode(node.body, id);
                            if (bodyExit) mm += `  ${bodyExit} -- Loop --> ${id}\n`;

                            return id;
                        }

                        // 5. Loops (For)
                        if (node.type === 'ForStatement') {
                            const initCode = node.init ? getSource(node.init) : '';
                            const testCode = node.test ? getSource(node.test) : 'true';

                            // Init Node
                            const initId = `${id}_Init`;
                            mm += `  ${initId}[${sanitizeLabelStrict(initCode)}]\n`;
                            if (prevId) mm += `  ${prevId} --> ${initId}\n`;

                            // Condition Node
                            const condId = `${id}_Cond`;
                            mm += `  ${condId}{{ ${sanitizeLabelStrict(testCode)} }}\n`;
                            mm += `  ${initId} --> ${condId}\n`;

                            // Body
                            const bodyExit = processEsprimaNode(node.body, condId);

                            // Update (Increment)
                            if (node.update) {
                                const updateCode = getSource(node.update);
                                const upId = `${id}_Up`;
                                mm += `  ${upId}[${sanitizeLabelStrict(updateCode)}]\n`;
                                if (bodyExit) mm += `  ${bodyExit} --> ${upId}\n`;
                                mm += `  ${upId} --> ${condId}\n`;
                            } else {
                                if (bodyExit) mm += `  ${bodyExit} --> ${condId}\n`;
                            }

                            return condId;
                        }

                        // 6. Try/Catch
                        if (node.type === 'TryStatement') {
                            const tryStartId = `${id}_TryStart`;
                            mm += `  ${tryStartId}>"Try Block"]\n`;
                            if (prevId) mm += `  ${prevId} --> ${tryStartId}\n`;

                            const tryExit = processEsprimaNode(node.block, tryStartId);

                            let catchExit = null;
                            if (node.handler) {
                                // Catch clause usually has a param
                                const catchParam = node.handler.param ? node.handler.param.name : 'err';
                                const catchStart = `${id}_CatchStart`;
                                mm += `  ${catchStart}>"Catch (${catchParam})"]\n`;

                                if (tryExit) mm += `  ${tryExit} -. Ex .-> ${catchStart}\n`;
                                else mm += `  ${tryStartId} -. Ex .-> ${catchStart}\n`; // If try empty

                                catchExit = processEsprimaNode(node.handler.body, catchStart);
                            }

                            const mergeId = `M_${id}`;
                            mm += `  ${mergeId}(( ))\n`;

                            if (tryExit) mm += `  ${tryExit} --> ${mergeId}\n`;
                            if (catchExit) mm += `  ${catchExit} --> ${mergeId}\n`;

                            if (node.finalizer) {
                                return processEsprimaNode(node.finalizer, mergeId);
                            }
                            return mergeId;
                        }

                        // 7. Standard Statements (Expression, VariableDecl)
                        if (node.type === 'ExpressionStatement' || node.type === 'VariableDeclaration' || node.type === 'ReturnStatement') {

                            // Check for Promise Chains in Source
                            const raw = getSource(node);
                            // Clean trailing semicolons
                            let displayLabel = sanitizeLabelStrict(getLine(line) || raw);

                            if (raw.includes('.then') || raw.includes('.catch')) {
                                // Simple chain visualizer
                                // Split by .then / .catch
                                const parts = raw.split(/(?=.then|(?=.catch))/); // positive lookahead split
                                let chainPrev = prevId;

                                parts.forEach((part, idx) => {
                                    const pId = `L${line}_${idx}_${nodeIdCounter++}`;
                                    mm += `  ${pId}["${sanitizeLabelStrict(part.trim())}"]\n`;
                                    if (chainPrev) mm += `  ${chainPrev} --> ${pId}\n`;
                                    chainPrev = pId;
                                });
                                return chainPrev;
                            }

                            // Standard Box
                            mm += `  ${id}["${displayLabel}"]\n`;
                            if (prevId) mm += `  ${prevId} --> ${id}\n`;
                            return id;
                        }

                        // Fallback
                        return prevId;
                    };

                    // Execute Recursive Processor
                    processEsprimaNode(program, null);

                } catch (e) {
                    console.error("Esprima Parse Error", e);

                    mm += `  Error["Parse Error: ${e}"]\n`;
                }
            }

            // === STRATEGY 4: C# (Tree-sitter) ===
            else if (language.toLowerCase().includes('csharp') || language.toLowerCase().includes('c#')) {
                const { treeSitterService } = await import('./treeSitterService');
                const tree = await treeSitterService.parse(code, 'csharp');
                if (!tree) return "";

                // Helper: Process a list of nodes (e.g., Block children)
                const processList = (nodes: any[], prevId: string | null): string | null => {
                    let currentPrev = prevId;
                    for (const node of nodes) {
                        if (!node.isNamed) continue;
                        const exit = renderNode(node, currentPrev);
                        // If renderNode returns an ID (or null), update currentPrev only if it flowed
                        // Note: renderNode handles the linking internally, returning the 'exit' node ID.
                        currentPrev = exit || currentPrev;
                    }
                    return currentPrev;
                };

                // Helper: Process a container (Block or Single Statement)
                // If it's a block, we iterate children. If single, we render it directly.
                const processBody = (node: any, prevId: string | null): string | null => {
                    if (!node) return prevId;
                    if (node.type === 'block') {
                        return processList(node.children || [], prevId);
                    } else {
                        return renderNode(node, prevId);
                    }
                };

                // Core Renderer for a Single Node
                const renderNode = (node: any, prevId: string | null): string | null => {
                    // Line-based ID
                    const line = (node.startPosition ? node.startPosition.row : 0) + 1;
                    const id = `L${line}_${nodeIdCounter++}`;
                    const type = node.type;

                    // Ignored Types
                    if (type === 'comment' || type === 'using_directive') return prevId;

                    let nodeDef = "";
                    let isTerminal = false;
                    let nextPrev = id; // Default exit is self

                    // Label Content
                    const content = getLine(line) || type;
                    const label = sanitizeLabel(content);

                    switch (type) {
                        case 'namespace_declaration':
                        case 'class_declaration':
                            const nameNode = node.childForFieldName('name');
                            const name = nameNode ? nameNode.text : 'Block';
                            mm += `subgraph ${id} ["${sanitizeLabel(name)}"]\n`;
                            mm += `  direction TB\n`;
                            const body = node.childForFieldName('body');
                            if (body) processList(body.children || [], null); // Independent scope
                            mm += `end\n`;
                            return null; // No flow out of class def

                        case 'method_declaration':
                            const methodName = node.childForFieldName('name');
                            const mLabel = methodName ? methodName.text : 'Method';
                            nodeDef = `${id}([Method: ${sanitizeLabel(mLabel)}])`;
                            mm += `  ${nodeDef};\n`; // Add semicolon

                            const mBody = node.childForFieldName('body');
                            if (mBody) {
                                return processBody(mBody, id);
                            }
                            return id;

                        // Try-Catch-Finally
                        case 'try_statement':
                            const tryBody = node.childForFieldName('body');

                            // Try Body
                            const tryExit = processBody(tryBody, prevId); // Link from prevId to Try Body Start

                            const mergeId = `M_${id}`;
                            mm += `  ${mergeId}(( ));\n`; // Add semicolon

                            // Success Flow -> Merge
                            if (tryExit) mm += `  ${tryExit} --> ${mergeId};\n`;
                            else if (prevId) mm += `  ${prevId} --> ${mergeId};\n`; // Empty try?

                            // Catch Clauses
                            // Tree-sitter C#: catch_clause are children of try_statement
                            for (const child of node.children) {
                                if (child.type === 'catch_clause') {
                                    const cSpec = child.childForFieldName('specifier'); // (Exception e)
                                    const cBody = child.childForFieldName('body');

                                    const catchId = `L${child.startPosition.row + 1}_${nodeIdCounter++}`;
                                    const catchLabel = cSpec ? sanitizeLabel(cSpec.text) : "Catch";
                                    mm += `  ${catchId}([${catchLabel}]);\n`; // Add semicolon

                                    // Exception Flow (dotted)
                                    if (prevId) mm += `  ${prevId} -. Exception .-> ${catchId};\n`;

                                    const cExit = processBody(cBody, catchId);
                                    if (cExit) mm += `  ${cExit} --> ${mergeId};\n`;
                                    else mm += `  ${catchId} --> ${mergeId};\n`;
                                }
                            }

                            // Finally
                            const fin = node.childForFieldName('finally_clause');
                            if (fin) {
                                const finBody = fin.childForFieldName('body');
                                const finId = `L${fin.startPosition.row + 1}_${nodeIdCounter++}`;
                                mm += `  ${finId}{{Finally}};\n`;
                                mm += `  ${mergeId} --> ${finId};\n`;
                                return processBody(finBody, finId);
                            }

                            return mergeId;

                        case 'using_statement':
                            nodeDef = `${id}["${label}"]`;
                            mm += `  ${nodeDef};\n`;
                            if (prevId) mm += `  ${prevId} --> ${id};\n`;

                            const uBody = node.childForFieldName('body');
                            if (uBody) {
                                const uExit = processBody(uBody, id);
                                const endId = `L${line}_${nodeIdCounter++}`;
                                mm += `  ${endId}["End Using"];\n`;
                                if (uExit) mm += `  ${uExit} --> ${endId};\n`;
                                else mm += `  ${id} --> ${endId};\n`;
                                return endId;
                            }
                            return id;

                        case 'if_statement':
                            const condition = node.childForFieldName('condition');
                            const condText = condition ? sanitizeLabel(condition.text) : 'If';
                            nodeDef = `${id}{"${condText}"}`;
                            mm += `  ${nodeDef};\n`;
                            if (prevId) mm += `  ${prevId} --> ${id};\n`;

                            const thenBlock = node.childForFieldName('consequence');
                            const elseBlock = node.childForFieldName('alternative');
                            const ifMergeId = `M_${id}`;
                            mm += `  ${ifMergeId}(( ));\n`;

                            // Then
                            if (thenBlock) {
                                const exit = processBody(thenBlock, id);
                                if (exit) mm += `  ${exit} --> ${ifMergeId};\n`;
                                else mm += `  ${id} -- Yes --> ${ifMergeId};\n`;
                            } else {
                                mm += `  ${id} -- Yes --> ${ifMergeId};\n`;
                            }

                            // Else
                            if (elseBlock) {
                                // Flatten 'else if'
                                if (elseBlock.type === 'if_statement') {
                                    const exit = renderNode(elseBlock, id); // Direct recursion for flattening
                                    if (exit) mm += `  ${exit} --> ${ifMergeId};\n`;
                                } else {
                                    const exit = processBody(elseBlock, id);
                                    if (exit) mm += `  ${exit} --> ${ifMergeId};\n`;
                                    else mm += `  ${id} -- No --> ${ifMergeId};\n`; // Correcting labeled edge logic
                                }
                            } else {
                                mm += `  ${id} -- No --> ${ifMergeId};\n`;
                            }
                            return ifMergeId;

                        case 'while_statement':
                        case 'for_statement':
                        case 'foreach_statement':
                            nodeDef = `${id}{{"${label}"}}`;
                            mm += `  ${nodeDef};\n`;
                            if (prevId) mm += `  ${prevId} --> ${id};\n`;

                            const loopBody = node.childForFieldName('body');
                            if (loopBody) {
                                const exit = processBody(loopBody, id);
                                if (exit) mm += `  ${exit} -- Repeat --> ${id};\n`;
                            }
                            return id;

                        case 'return_statement':
                            nodeDef = `${id}(("Return"))`;
                            isTerminal = true;
                            // Do NOT iterate children (expression/boolean_literal)
                            break;

                        case 'local_declaration_statement':
                        case 'expression_statement':
                        case 'contextual_keyword':
                        case 'invocation_expression': // Explicitly handle invocation if it appears top-level
                            nodeDef = `${id}["${label}"]`;
                            break;

                        case 'block':
                            // If we encounter a block directly (naked block), process its list
                            return processList(node.children || [], prevId);

                        default:
                            // Fallback for others
                            nodeDef = `${id}["${label}"]`;
                            break;
                    }

                    // Emit
                    if (nodeDef) {
                        mm += `  ${nodeDef};\n`;
                        if (prevId && prevId !== id && !nodeDef.includes('subgraph')) {
                            // Clean IDs for linking
                            const pClean = prevId.split(/[\{\[\(\>\/]/)[0].trim();
                            const cClean = nodeDef.split(/[\{\[\(\>\/]/)[0].trim();
                            if (!mm.includes(`${pClean} --> ${cClean}`)) {
                                mm += `  ${pClean} --> ${cClean};\n`;
                            }
                        }
                    }

                    return isTerminal ? null : id;
                };

                // Start from Root Children
                if (tree.rootNode && tree.rootNode.children) {
                    processList(tree.rootNode.children, null);
                }
            }

            // === STRATEGY 5: SQL SERVER (T-SQL via node-sql-parser) ===
            else if (language.toLowerCase().includes('sql') && !language.toLowerCase().includes('spark') && !language.toLowerCase().includes('snowflake')) {
                // @ts-ignore
                const parser = new NodeSqlParser();
                // @ts-ignore
                const ast = parser.astify(code, { database: 'transactsql' });

                const clauses: any[] = [];
                const query: any = Array.isArray(ast) ? ast[0] : ast;

                if (!query) return "";

                // --- 1. FROM (Rank 0) ---
                if (query.from) {
                    // @ts-ignore
                    query.from.forEach((f: any) => {
                        clauses.push({
                            rank: 0,
                            id: newId(),
                            label: `FROM: ${f.table} `,
                            type: 'source'
                        });
                    });
                }

                // --- 2. JOINs (Rank 0.5) ---
                // node-sql-parser puts joins in 'from' sometimes or separate depending on syntax
                // But for Mermaid we rely on sorting. 
                // We'll rely on the parser structure.

                // --- 3. WHERE (Rank 1) ---
                if (query.where) {
                    clauses.push({
                        rank: 1,
                        id: newId(),
                        label: `WHERE Logic...`,
                        type: 'filter'
                    });
                }

                // --- 4. GROUP BY (Rank 2) ---
                if (query.groupby) {
                    const cols = query.groupby.map((c: any) => c.column || c.value).join(', ');
                    clauses.push({
                        rank: 2,
                        id: newId(),
                        label: `GROUP BY: ${cols.substring(0, 20)} `,
                        type: 'process'
                    });
                }

                // --- 5. SELECT (Rank 3) ---
                if (query.columns) {
                    const cols = query.columns === '*'
                        ? '*'
                        : query.columns.map((c: any) => c.expr?.column || c.expr?.value || 'Expr').join(', ');

                    clauses.push({
                        rank: 3,
                        id: newId(),
                        label: `SELECT: ${cols.substring(0, 30)}...`,
                        type: 'select'
                    });
                }

                // --- 6. ORDER BY (Rank 4) ---
                if (query.orderby) {
                    const cols = query.orderby.map((c: any) => c.expr.column || c.expr.value).join(', ');
                    clauses.push({
                        rank: 4,
                        id: newId(),
                        label: `ORDER BY: ${cols} `,
                        type: 'terminal'
                    });
                }

                // --- 7. LIMIT/TOP (Rank 5) ---
                if (query.limit) {
                    clauses.push({
                        rank: 5,
                        id: newId(),
                        label: `LIMIT / TOP: ${query.limit.value?.length ? query.limit.value[0]?.value : 'Limit'} `,
                        type: 'terminal'
                    });
                }

                // Sort and Build Mermaid
                clauses.sort((a, b) => a.rank - b.rank);

                if (clauses.length > 0) {
                    let prevId = null;
                    for (const c of clauses) {
                        let finalDef = "";
                        const safeLabel = sanitizeLabel(c.label);
                        if (c.type === 'source') finalDef = `${c.id} [(${safeLabel})]`;
                        else if (c.type === 'filter') finalDef = `${c.id} {${safeLabel} } `;
                        else if (c.type === 'select') finalDef = `${c.id} ([${safeLabel}])`;
                        else if (c.type === 'terminal') finalDef = `${c.id} [[${safeLabel}]]`;
                        else finalDef = `${c.id} [${safeLabel}]`;

                        mm += `  ${finalDef} \n`;
                        if (prevId) {
                            mm += `  ${prevId} --> ${c.id} \n`;
                        }
                        prevId = c.id;
                    }
                } else {
                    mm += `  n0[Query]-- > n1[Parse Failed]\n`;
                }

                if (nodeIdCounter === 0 && !mm.includes('Query')) return "";
                if (nodeIdCounter === 0 && !mm.includes('Query')) return "";
                return mm;

            }

            // === STRATEGY 7: SPARK SQL (Advanced Static Planner) ===
            else if (language.toLowerCase().includes('spark')) {
                const raw = code.replace(/\-\-.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, ''); // strip comments
                const clauses: any[] = [];

                // Spark Logical Order (Data Flow)
                const RANK = {
                    CTE: 0,
                    SOURCE: 1,      // FROM
                    JOIN: 2,
                    LATERAL: 3,     // Spark Specific: Explode/Lateral View
                    WHERE: 4,
                    GROUP_BY: 5,
                    HAVING: 6,
                    WINDOW: 7,      // Window Functions / Rank
                    SELECT: 8,
                    DISTRIBUTE: 9,  // Spark Specific: Distribute/Cluster By
                    LIMIT: 10
                };

                // --- 1. CTEs (Common Table Expressions) ---
                const cteMatches = Array.from(raw.matchAll(/WITH\s+([a-zA-Z0-9_]+)\s+AS/gi));
                for (const m of cteMatches) {
                    clauses.push({ rank: RANK.CTE, id: newId(), label: `CTE: ${m[1]} `, type: 'cte' });
                }

                // --- 2. FROM (Sources) ---
                // Matches "FROM table" OR "FROM parquet.'path'"
                const fromMatch = raw.match(/FROM\s+([a-zA-Z0-9_.$`'"]+)/i);
                if (fromMatch) {
                    let tableName = fromMatch[1].replace(/`/g, '');
                    if (tableName.includes('parquet')) tableName = `Parquet: ${tableName.split(/[\/\\]/).pop()?.replace(/['"]/g, '')}`;
                    clauses.push({ rank: RANK.SOURCE, id: newId(), label: `FROM: ${tableName}`, type: 'source' });
                }

                // --- 3. JOINs ---
                const joinMatches = Array.from(raw.matchAll(/(LEFT|RIGHT|INNER|OUTER|CROSS|ANTI|SEMI)?\s*JOIN\s+([a-zA-Z0-9_.$`]+)/gi));
                for (const m of joinMatches) {
                    const type = m[1] || 'INNER';
                    const table = m[2].replace(/`/g, '');
                    clauses.push({ rank: RANK.JOIN, id: newId(), label: `${type} JOIN: ${table}`, type: 'join' });
                }

                // --- 4. LATERAL VIEW (Spark Specific) ---
                const lateralMatches = Array.from(raw.matchAll(/LATERAL VIEW\s+(explode|json_tuple|posexplode)\((.*?)\)\s+(\w+)\s+AS\s+([a-zA-Z0-9_,]+)/gi));
                for (const m of lateralMatches) {
                    clauses.push({ rank: RANK.LATERAL, id: newId(), label: `LATERAL: ${m[1]}(...)\n-> ${m[4]}`, type: 'lateral' });
                }

                // --- 5. WHERE Filter ---
                const whereMatch = raw.match(/WHERE\s+(.*?)(?=\s+(GROUP|ORDER|HAVING|LIMIT|WINDOW|CLUSTER|DISTRIBUTE|LATERAL)|$)/is);
                if (whereMatch) {
                    let cond = whereMatch[1].trim();
                    if (cond.length > 40) cond = cond.substring(0, 40) + '...';
                    clauses.push({ rank: RANK.WHERE, id: newId(), label: `WHERE: ${cond}`, type: 'filter' });
                }

                // --- 6. GROUP BY ---
                const groupMatch = raw.match(/GROUP BY\s+(.*?)(?=\s+(HAVING|ORDER|LIMIT|WINDOW)|$)/is);
                if (groupMatch) {
                    clauses.push({ rank: RANK.GROUP_BY, id: newId(), label: `GROUP BY: ${groupMatch[1].trim().substring(0, 30)}`, type: 'process' });
                }

                // --- 7. SELECT (Projections) ---
                const selectMatch = raw.match(/SELECT\s+(.*?)\s+FROM/is);
                if (selectMatch) {
                    let cols = selectMatch[1].replace(/\s+/g, ' ').trim();
                    if (cols.length > 40) cols = cols.substring(0, 40) + '...';
                    clauses.push({ rank: RANK.SELECT, id: newId(), label: `SELECT: ${cols}`, type: 'select' });
                }

                // --- 8. SPARK SHUFFLING (Distribute/Cluster By) ---
                if (raw.match(/CLUSTER BY/i)) clauses.push({ rank: RANK.DISTRIBUTE, id: newId(), label: 'CLUSTER BY', type: 'distribute' });
                if (raw.match(/DISTRIBUTE BY/i)) clauses.push({ rank: RANK.DISTRIBUTE, id: newId(), label: 'DISTRIBUTE BY', type: 'distribute' });

                // --- 9. LIMIT ---
                const limitMatch = raw.match(/LIMIT\s+(\d+)/i);
                if (limitMatch) {
                    clauses.push({ rank: RANK.LIMIT, id: newId(), label: `LIMIT ${limitMatch[1]}`, type: 'terminal' });
                }

                // Sort
                clauses.sort((a, b) => a.rank - b.rank);

                const styles: string[] = [];

                if (clauses.length > 0) {
                    let prevId = null;
                    for (const c of clauses) {
                        let finalDef = "";
                        const safeLabel = sanitizeLabel(c.label);

                        // Theme Colors (Spark Brand)
                        if (c.type === 'source' || c.type === 'join') {
                            finalDef = `${c.id}[(${safeLabel})]`;
                            styles.push(`style ${c.id} fill:#e65100,color:#fff,stroke:#bf360c`);
                        }
                        else if (c.type === 'lateral') {
                            finalDef = `${c.id}{{${safeLabel}}}`;
                            styles.push(`style ${c.id} fill:#ffccbc,stroke:#bf360c`);
                        }
                        else if (c.type === 'distribute') {
                            finalDef = `${c.id}[[${safeLabel}]]`;
                            styles.push(`style ${c.id} fill:#fff9c4,stroke:#fbc02d`);
                        }
                        else if (c.type === 'select') {
                            finalDef = `${c.id}([${safeLabel}])`;
                            styles.push(`style ${c.id} fill:#e8f5e9,stroke:#2e7d32`);
                        }
                        else if (c.type === 'filter') {
                            finalDef = `${c.id}{${safeLabel}}`;
                            styles.push(`style ${c.id} fill:#fff3e0,stroke:#e65100`);
                        }
                        else if (c.type === 'cte') {
                            finalDef = `${c.id}>${safeLabel}]`;
                            styles.push(`style ${c.id} fill:#e1f5fe,stroke:#0277bd`);
                        }
                        else {
                            finalDef = `${c.id}[${safeLabel}]`;
                        }

                        mm += `  ${finalDef}\n`;
                        if (prevId) mm += `  ${prevId} --> ${c.id}\n`;
                        prevId = c.id;
                    }
                    // Apply styles at end
                    mm += styles.map(s => `  ${s}`).join('\n') + '\n';

                } else {
                    if (code.trim()) mm += `  n0[Query] --> n1[Empty/Valid]\n`;
                }
            }

            // === STRATEGY 6: MySQL (node-sql-parser) ===
            else if (language.toLowerCase().includes('mysql')) {
                // @ts-ignore
                const parser = new NodeSqlParser();
                // @ts-ignore
                const ast = parser.astify(code, { database: 'mysql' });

                const clauses: any[] = [];
                const query: any = Array.isArray(ast) ? ast[0] : ast;

                if (!query) return "";

                // MySQL Ranks
                // FROM: 0, JOIN: 1, WHERE: 2, GROUPBY: 3, SELECT: 4, LIMIT: 5

                // --- 1. FROM (Rank 0) & JOIN (Rank 1) ---
                if (query.from) {
                    // @ts-ignore
                    query.from.forEach((f: any) => {
                        const label = f.db ? `${f.db}.${f.table}` : f.table;
                        const simpleLabel = label || 'Table';
                        // logicMapService traditionally treats FROM and JOIN somewhat together in flow
                        // But user specifically asked for Rank 0 vs Rank 1.
                        clauses.push({
                            rank: 0,
                            id: newId(),
                            label: `FROM: ${simpleLabel}`,
                            type: 'source'
                        });
                    });
                }

                // --- 2. WHERE (Rank 2) ---
                if (query.where) {
                    clauses.push({
                        rank: 2,
                        id: newId(),
                        label: `WHERE Logic...`,
                        type: 'filter'
                    });
                }

                // --- 3. GROUP BY (Rank 3) ---
                if (query.groupby) {
                    const groups = query.groupby.map((g: any) => g.value).join(', ');
                    clauses.push({
                        rank: 3,
                        id: newId(),
                        label: `GROUP BY: ${groups.substring(0, 20)}`,
                        type: 'process'
                    });
                }

                // --- 4. SELECT (Rank 4) ---
                if (query.columns) {
                    const cols = query.columns === '*'
                        ? '*'
                        : query.columns.map((c: any) => c.expr?.column || c.expr?.value || 'Expr').join(', ');

                    clauses.push({
                        rank: 4,
                        id: newId(),
                        label: `SELECT: ${cols.substring(0, 30)}...`,
                        type: 'select'
                    });
                }

                // --- 5. LIMIT (Rank 5) - MySQL Specific ---
                if (query.limit) {
                    // query.limit.value can be array or object depending on parser version/syntax
                    let limitVal = "Limit";
                    if (Array.isArray(query.limit.value)) {
                        limitVal = query.limit.value[0]?.value;
                    } else if (query.limit.value) {
                        limitVal = query.limit.value;
                    }
                    clauses.push({
                        rank: 5,
                        id: newId(),
                        label: `LIMIT ${limitVal}`,
                        type: 'terminal'
                    });
                }

                // Sort
                clauses.sort((a, b) => a.rank - b.rank);

                if (clauses.length > 0) {
                    let prevId = null;
                    for (const c of clauses) {
                        let finalDef = "";
                        const safeLabel = sanitizeLabel(c.label);
                        if (c.type === 'source') finalDef = `${c.id}[(${safeLabel})]`; // Cylinder syntax
                        else if (c.type === 'filter') finalDef = `${c.id}{${safeLabel}}`;
                        else if (c.type === 'select') finalDef = `${c.id}([${safeLabel}])`;
                        else if (c.type === 'terminal') finalDef = `${c.id}[[${safeLabel}]]`;
                        else finalDef = `${c.id}[${safeLabel}]`;

                        mm += `  ${finalDef}\n`;
                        if (prevId) {
                            mm += `  ${prevId} --> ${c.id}\n`;
                        }
                        prevId = c.id;
                    }
                } else {
                    mm += `  n0[Query] --> n1[Empty/Valid]\n`;
                }
            }

            // === SHARED RENDER LOGIC ===
            // Fallback if graph is empty but code exists
            if (code.trim().length > 0 && (!mm || mm.length < 30)) {
                return `flowchart TD\n  nError[Analysis Incomplete] --> nHelp[Try simpler code]\n`;
            }

            if (mm && mm.length > 20) {
                return mm;
            }
            return "";

        } catch (e) {
            console.warn("[LogicMap] Parse failed:", e);
            return "";
        }
    }
}

export const logicMapService = new LogicMapService();
