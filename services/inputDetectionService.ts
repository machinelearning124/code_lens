/**
 * Service to detect user input requirements in code
 * Currently supports: Python
 */

export interface DetectedInput {
    name: string;
    type: 'str' | 'int' | 'float' | 'bool';
}

export class InputDetectionService {

    /**
     * Detects input statements in code and returns variable names with inferred types.
     * Uses Regex for resilience against partial/invalid code.
     * 
     * @param code The source code
     * @param language The language of the code
     * @returns Array of detected inputs with types
     */
    detectInputs(code: string, language: string): DetectedInput[] {
        if (!code) return [];

        const lang = language.toLowerCase();

        if (lang === 'python') return this.detectPythonInputs(code);
        if (lang === 'java') return this.detectJavaInputs(code);
        if (lang === 'javascript') return this.detectJavascriptInputs(code);
        if (lang === 'c#') return this.detectCSharpInputs(code);
        if (lang === 'sql server sql') return this.detectTSQLInputs(code);
        if (lang === 'mysql sql') return this.detectMySQLInputs(code);
        if (lang === 'spark sql') return this.detectSparkSQLInputs(code);

        return [];
    }

    private detectPythonInputs(code: string): DetectedInput[] {
        const inputs: DetectedInput[] = [];
        const lines = code.split('\n');
        // Matches: var = int(input(...))  OR  var = input(...)
        const inputRegex = /^\s*(?:([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*)?([a-zA-Z_]+)?\s*\(?\s*input\s*\(/;

        lines.forEach(line => {
            const cleanLine = line.split('#')[0];
            const match = cleanLine.match(inputRegex);
            if (match) {
                const varName = match[1] || `Input ${inputs.length + 1}`;
                const wrapper = match[2];
                let type: 'str' | 'int' | 'float' | 'bool' = 'str';
                if (wrapper) {
                    if (wrapper === 'int') type = 'int';
                    else if (wrapper === 'float') type = 'float';
                    else if (wrapper === 'bool') type = 'bool';
                }
                inputs.push({ name: varName, type });
            }
        });
        return inputs;
    }

    private detectJavaInputs(code: string): DetectedInput[] {
        const inputs: DetectedInput[] = [];
        const lines = code.split('\n');
        // Matches: Type var = scanner.nextType()
        // e.g. int age = sc.nextInt();
        const regex = /(?:int|double|String|boolean|float)\s+([a-zA-Z0-9_]+)\s*=\s*[a-zA-Z0-9_]+\.next([a-zA-Z]+)?\(/;

        lines.forEach(line => {
            const cleanLine = line.split('//')[0];
            const match = cleanLine.match(regex);
            if (match) {
                const varName = match[1];
                const method = match[2] || ''; // e.g. Int, Double
                let type: 'str' | 'int' | 'float' | 'bool' = 'str';

                if (method.includes('Int')) type = 'int';
                else if (method.includes('Double') || method.includes('Float')) type = 'float';
                else if (method.includes('Boolean')) type = 'bool';

                inputs.push({ name: varName, type });
            }
        });
        return inputs;
    }

    private detectJavascriptInputs(code: string): DetectedInput[] {
        const inputs: DetectedInput[] = [];
        const lines = code.split('\n');
        // Matches: const x = prompt(...) OR readline.question(...)
        const regex = /(?:const|let|var)\s+([a-zA-Z0-9_]+)\s*=\s*(?:await\s*)?(?:prompt|.*\.question)\s*\(/;

        lines.forEach(line => {
            const cleanLine = line.split('//')[0];
            const match = cleanLine.match(regex);
            if (match) {
                inputs.push({ name: match[1], type: 'str' }); // JS inputs are usually strings by default
            }
        });
        return inputs;
    }

    private detectCSharpInputs(code: string): DetectedInput[] {
        const inputs: DetectedInput[] = [];
        const lines = code.split('\n');
        // Matches: var x = Console.ReadLine()
        const regex = /(?:var|string|int|double|bool)\s+([a-zA-Z0-9_]+)\s*=\s*(?:Convert\.To([a-zA-Z0-9]+)\()?\s*Console\.ReadLine/;

        lines.forEach(line => {
            const cleanLine = line.split('//')[0];
            const match = cleanLine.match(regex);
            if (match) {
                const varName = match[1];
                const typeConv = match[2]; // e.g. Int32
                let type: 'str' | 'int' | 'float' | 'bool' = 'str';

                if (typeConv) {
                    if (typeConv.includes('Int')) type = 'int';
                    else if (typeConv.includes('Double') || typeConv.includes('Single')) type = 'float';
                    else if (typeConv.includes('Boolean')) type = 'bool';
                }
                inputs.push({ name: varName, type });
            }
        });
        return inputs;
    }

    private detectTSQLInputs(code: string): DetectedInput[] {
        const inputs: DetectedInput[] = [];
        const lines = code.split('\n');
        // Matches: DECLARE @var DataType
        const regex = /DECLARE\s+@([a-zA-Z0-9_]+)\s+([a-zA-Z]+)/i;

        lines.forEach(line => {
            const cleanLine = line.split('--')[0];
            const match = cleanLine.match(regex);
            if (match) {
                const varName = match[1];
                const sqlType = match[2].toUpperCase();
                let type: 'str' | 'int' | 'float' | 'bool' = 'str';

                if (['INT', 'BIGINT', 'SMALLINT', 'TINYINT', 'BIT'].some(t => sqlType.includes(t))) type = 'int';
                else if (['FLOAT', 'REAL', 'DECIMAL', 'NUMERIC', 'MONEY'].some(t => sqlType.includes(t))) type = 'float';

                inputs.push({ name: varName, type });
            }
        });
        return inputs;
    }

    private detectMySQLInputs(code: string): DetectedInput[] {
        const inputs: DetectedInput[] = [];
        const lines = code.split('\n');
        // Matches: SET @var = val
        const regex = /SET\s+@([a-zA-Z0-9_]+)\s*=/i;

        lines.forEach(line => {
            const cleanLine = line.split('#')[0].split('--')[0];
            const match = cleanLine.match(regex);
            if (match) {
                inputs.push({ name: match[1], type: 'str' }); // Inferring type is hard in simple SET, default to str
            }
        });
        return inputs;
    }

    private detectSparkSQLInputs(code: string): DetectedInput[] {
        const inputs: DetectedInput[] = [];
        const lines = code.split('\n');

        // Match 1: SET key = val OR DECLARE var ...
        const setDeclareRegex = /(?:SET|DECLARE)\s+([a-zA-Z0-9_]+)\s*(?:=|\s+)/i;

        // Match 2: CREATE WIDGET [TYPE] name DEFAULT 'value'
        // e.g. CREATE WIDGET TEXT emp_name DEFAULT 'Sam';
        const widgetRegex = /CREATE\s+WIDGET\s+(?:TEXT|DROPDOWN|COMBOBOX|MULTISELECT)\s+([a-zA-Z0-9_]+)/i;

        lines.forEach(line => {
            const cleanLine = line.split('--')[0];

            // Check for Widgets
            const widgetMatch = cleanLine.match(widgetRegex);
            if (widgetMatch) {
                inputs.push({ name: widgetMatch[1], type: 'str' });
                return;
            }

            // Check for SET/DECLARE
            const match = cleanLine.match(setDeclareRegex);
            if (match) {
                inputs.push({ name: match[1], type: 'str' });
            }
        });
        return inputs;
    }
}

export const inputDetectionService = new InputDetectionService();
