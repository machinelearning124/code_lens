const path = require('path');

async function run() {
    const { Parser, Language } = require('web-tree-sitter');
    await Parser.init({
        locateFile(scriptName, scriptDirectory) {
            return path.join(__dirname, 'node_modules', 'web-tree-sitter', 'web-tree-sitter.wasm');
        },
    });
    const parser = new Parser();
    const Lang = await Language.load(path.join(__dirname, 'node_modules', 'tree-sitter-c-sharp', 'tree-sitter-c_sharp.wasm'));
    parser.setLanguage(Lang);

    const code = `
    using System;
    namespace Demo {
        class Program {
            void Main() {
                try {
                    int x = 10;
                    if (x > 5) {
                        Console.WriteLine("Big");
                    }
                } catch (Exception e) {
                    Console.WriteLine("Error");
                }
            }
        }
    }
    `;

    const tree = parser.parse(code);
    let nodeIdCounter = 0;
    let mm = "graph TD\n";

    // MOCK getLine to return simple text
    const getLine = (lineNum) => {
        const lines = code.split('\n');
        return lines[lineNum - 1] ? lines[lineNum - 1].trim() : "";
    };

    const sanitizeLabel = (str) => str.replace(/"/g, "'").substring(0, 20);

    // --- COPIED LOGIC FROM logicMapService.ts ---
    const processList = (nodes, prevId) => {
        let currentPrev = prevId;
        for (const node of nodes) {
            if (!node.isNamed) continue;
            const exit = renderNode(node, currentPrev);
            currentPrev = exit || currentPrev;
        }
        return currentPrev;
    };

    const processBody = (node, prevId) => {
        if (!node) return prevId;
        if (node.type === 'block') {
            return processList(node.children || [], prevId);
        } else {
            return renderNode(node, prevId);
        }
    };

    const renderNode = (node, prevId) => {
        // Line-based ID
        const line = (node.startPosition ? node.startPosition.row : 0) + 1;
        const id = `L${line}_${nodeIdCounter++}`;
        const type = node.type;

        // Ignored Types
        if (type === 'comment' || type === 'using_directive') return prevId;

        let nodeDef = "";
        let isTerminal = false;
        let nextPrev = id;

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
                if (body) processList(body.children || [], null);
                mm += `end\n`;
                return null;

            case 'method_declaration':
                const methodName = node.childForFieldName('name');
                const mLabel = methodName ? methodName.text : 'Method';
                nodeDef = `${id}([Method: ${sanitizeLabel(mLabel)}])`;
                mm += `  ${nodeDef};\n`;

                const mBody = node.childForFieldName('body');
                if (mBody) {
                    return processBody(mBody, id);
                }
                return id;

            case 'try_statement':
                const tryBody = node.childForFieldName('body');
                const tryExit = processBody(tryBody, prevId);
                const mergeId = `M_${id}`;
                mm += `  ${mergeId}(( ));\n`;

                if (tryExit) mm += `  ${tryExit} --> ${mergeId};\n`;
                else if (prevId) mm += `  ${prevId} --> ${mergeId};\n`;

                for (const child of node.children) {
                    if (child.type === 'catch_clause') {
                        const cSpec = child.childForFieldName('specifier');
                        const cBody = child.childForFieldName('body');

                        const catchId = `L${child.startPosition.row + 1}_${nodeIdCounter++}`;
                        const catchLabel = cSpec ? sanitizeLabel(cSpec.text) : "Catch";
                        mm += `  ${catchId}([${catchLabel}]);\n`;

                        if (prevId) mm += `  ${prevId} -. Exception .-> ${catchId};\n`;

                        const cExit = processBody(cBody, catchId);
                        if (cExit) mm += `  ${cExit} --> ${mergeId};\n`;
                        else mm += `  ${catchId} --> ${mergeId};\n`;
                    }
                }
                return mergeId;

            case 'if_statement':
                const condition = node.childForFieldName('condition');
                const condText = condition ? sanitizeLabel(condition.text) : 'If';
                nodeDef = `${id}{"${condText}"}`;
                mm += `  ${nodeDef};\n`;
                if (prevId) mm += `  ${prevId} --> ${id};\n`;

                // Simplified for test execution in verification script
                return id;

            case 'local_declaration_statement':
            case 'expression_statement':
                nodeDef = `${id}["${label}"]`;
                break;

            case 'block':
                return processList(node.children || [], prevId);

            default:
                nodeDef = `${id}["${label}"]`;
                break;
        }

        if (nodeDef) {
            mm += `  ${nodeDef};\n`;
            if (prevId && prevId !== id && !nodeDef.includes('subgraph')) {
                const pClean = prevId.split(/[\{\[\(\>\/]/)[0].trim();
                const cClean = nodeDef.split(/[\{\[\(\>\/]/)[0].trim();
                if (!mm.includes(`${pClean} --> ${cClean}`)) {
                    mm += `  ${pClean} --> ${cClean};\n`;
                }
            }
        }

        return isTerminal ? null : id;
    };
    // -------------------------------------------

    if (tree.rootNode && tree.rootNode.children) {
        processList(tree.rootNode.children, null);
    }

    console.log(mm);
}

run().catch(err => console.error(err));
