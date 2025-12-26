import { treeSitterService } from './services/treeSitterService';

const code = `
using System;

class Program {
    static void Main(string[] args) {
        Console.Write("Enter integer #1: ");
        string in1 = Console.ReadLine();
        int num1 = string.IsNullOrEmpty(in1) ? 0 : int.Parse(in1);
        Console.WriteLine(num1);
    }
}
`;

async function debug() {
    try {
        console.log("Initializing TreeSitter...");
        const svc = treeSitterService;
        await svc.init(); // Assuming init is needed or handled in parse

        console.log("Parsing...");
        const tree = await svc.parse(code, 'csharp');

        if (!tree) {
            console.error("Tree is null");
            return;
        }

        const visit = (node, depth) => {
            const indent = "  ".repeat(depth);
            console.log(`${indent}${node.type} [${node.text.substring(0, 20).replace(/\n/g, '')}...]`);
            for (const child of node.children) {
                visit(child, depth + 1);
            }
        };

        visit(tree.rootNode, 0);

    } catch (e) {
        console.error(e);
    }
}

debug();
