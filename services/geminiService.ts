import { GoogleGenAI, GenerateContentResponse, Type, HarmCategory, HarmBlockThreshold } from "@google/genai";
import { TabId } from '../types';
import { safeLogger } from './securityUtils';

const SAFETY_SETTINGS = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
];

const MAX_RETRIES = 2; // Total attempts = 1 + 2 = 3

// Helper to retry async operations
async function retryOperation<T>(operation: () => Promise<T>, retries = MAX_RETRIES): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (retries > 0) {
      console.warn(`Gemini API Failed. Retrying... (${retries} attempts left)`, error);
      await new Promise(resolve => setTimeout(resolve, 1000)); // 1s backoff
      return retryOperation(operation, retries - 1);
    }
    throw error;
  }
}

// Helper to convert File to Base64
const fileToGenerativePart = async (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      const base64Data = base64String.split(',')[1];
      resolve(base64Data);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

export const runGemini = async (
  task: TabId,
  text: string,
  image: File | null,
  targetLanguage: string | undefined,
  modelName: string,
  apiKey?: string,
  inputLanguage?: string,
  uploadedImages?: File[],
  inputValues?: Record<string, string>,
): Promise<any> => {
  const ai = new GoogleGenAI({ apiKey: apiKey || process.env.API_KEY });

  // Use user-selected model directly. User explicitly requested 'gemini-pro-latest'.
  // We strictly pass whatever string they selected.
  const apiModelName = modelName || 'gemini-pro-latest';

  // Handle Decode Logic specifically to return JSON
  if (task === TabId.Decode) {
    // Format inputs for prompt
    const inputValsStr = inputValues ? Object.entries(inputValues).map(([k, v]) => `${k} = ${v}`).join(', ') : "None provided";

    const systemInstruction = `
You are an expert Code Execution Tracer.
Your TASK is to simulate the execution of the provided code step-by-step and return a detailed Trace.

**CONTEXT:**
- User Inputs provided: [${inputValsStr}]

**CRITICAL INPUT OVERRIDE RULE:**
If the code asks for input (e.g. \`input()\`, \`Scanner\`) or uses variables defined in the User Inputs list above, you MUST simulate execution using the **User Input** values, ignoring any hardcoded values in the file.

RETURN JSON ONLY. Structure:
{
  "steps": [
    {
      "step": 1,
      "line": <line_number>,
      "variables": [
        { "name": "varName", "value": "<val>...", "type": "int|str|..." }
      ],
      "output": "<console output so far>",
      "explanation": "<ul><li>Concise explanation (max 12 words).</li></ul>"
    }
  ]
}

RULES:
1.  **ACCURACY**: Run the code mentally. Track variable state changes precisely using the **User Inputs**.
2.  **VARIABLES**: In 'variables', return a LIST of objects for changed/relevant variables.
3.  **OUTPUT**: 'output' field must be the CUMULATIVE console output up to this step.
    -   **CRITICAL FORMATTING RULE**: When any input is requested (e.g. 'input("Enter num: ")'), you MUST include the Prompt text AND the user's input value on the SAME line, followed immediately by a newline character.
    -   **Example**:
        -   Code: x = input("Name: ")
        -   User Input: "John"
        -   Output String: "Name: John\\n" (NOT "Name: \\nJohn" or just "Name: ")
4.  **EXPLANATION & STYLING**:
    -   MUST be valid HTML <ul><li>...</li></ul>.
    -   **STRUCTURE**: Break the step into **2-3 short bullet points** if it involves multiple checks or updates.
    -   **CONCISENESS**: MAX 5-8 Words per bullet. Use "Telegraphic Style" (start with verb, e.g. "Checks...", "Updates...", "Returns...").
    -   **CONCRETE VALUES**: Use ACTUAL runtime values in the explanation, not abstract variables. (e.g. Say "Checks <val>11</val> <= <v>1</v>" instead of "Checks num <= 1").
    -   **STYLING**: You MUST use these tags:
        -   <var>variableName</var> for variables.
        -   <val>value</val> for implementation values.
        -   <k>keyword</k> for logic terms.
        -   <f>funcName</f> for functions.

6.  **TERMINATION (STRICT)**:
    -   **STOP IMMEDIATELY** after the last productive statement of the last input.
    -   Do **NOT** generate any "Loop finished", "All inputs processed", or "End of program" steps.
    -   If the code ends, simply stop generating steps. The trace must end at the last *action* (e.g., print, return).

7.  **MATH VERIFICATION (STRICT)**:
    -   **DO NOT GUESS VALUES**. Perform the actual arithmetic for every step.
    -   **Loop Ranges**: Verify the exact content of \`range(start, end)\`. Remember \`end\` is exclusive in Python.
        -   Example: \`range(2, 5)\` is \`[2, 3, 4]\`. It does NOT include 5.
    -   **Conditions**: calculate \`num % i\` exactly. If \`112 % 2 == 0\`, then \`112 % 2\` IS 0.
    -   **Correction**: If your thought process disagrees with the code logic, FOLLOW THE CODE LOGIC.

8.  **CUMULATIVE HISTORY (CRITICAL)**:
    -   For **ANY** loop counter/iterator variable (e.g., \`i\`, \`count\`), in **EVERY** step (Normal Trace OR Summary):
    -   You **MUST** populate the \`history\` field with the **List of values encountered SO FAR** in the current loop.
    -   **Example**:
        -   Step 1 (Iter 1): \`i\`="2", \`history\`=["2"]
        -   Step 2 (Iter 2): \`i\`="3", \`history\`=["2", "3"]

9.  **SMART LOOP VISUALIZATION**:
    -   **CASE A: MAIN INPUT LOOPS** (Iterating over \`User Inputs\` list):
        -   **UNROLL ALL ITERATIONS**. Do NOT summarize.
        -   Generate full steps for Input 1, then full steps for Input 2, etc.
        -   This ensures the user sees the process repeated for every input.
    -   **CASE B: INTERNAL LOOPS** (Counters, Math, standard \`for/while\`):
        -   **Step 1**: Fully trace the **FIRST ITERATION** (enter body, check logic).
        -   **Step 2**: Generate **ONE Summary Step** for all remaining iterations.
        -   **Summary Variables**:
            -   **value**: Set to the **FINAL VALUE** of the variable after the last iteration (e.g. \`5\`).
            -   **history**: Set to a **List of ALL values** from **ALL iterations** (including the first one) (e.g. \`["2", "3", "4", "5"]\`).
        -   **Explanation**: "Runs remaining iterations. Counter \`i\` takes values [2..N]...".

NO MARKDOWN. NO \`\`\`json wrappers. JUST RAW JSON.
`;

    const jsonSchema = {
      type: Type.OBJECT,
      properties: {
        steps: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              step: { type: Type.NUMBER },
              line: { type: Type.NUMBER },
              explanation: { type: Type.STRING },
              variables: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    name: { type: Type.STRING },
                    value: { type: Type.STRING },
                    type: { type: Type.STRING },
                    history: { type: Type.ARRAY, items: { type: Type.STRING } }
                  },
                  required: ["name", "value", "type"]
                }
              },
              loop_stack: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    iteration: { type: Type.NUMBER },
                    variables: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          name: { type: Type.STRING },
                          value: { type: Type.STRING },
                          type: { type: Type.STRING },
                          history: { type: Type.ARRAY, items: { type: Type.STRING } }
                        },
                        required: ["name", "value", "type"]
                      }
                    }
                  },
                  required: ["iteration", "variables"]
                }
              },
              output: { type: Type.STRING }
            },
            required: ["step", "line", "explanation", "variables", "output"]
          }
        }
      },
      required: ["steps"]
    };

    return retryOperation(async () => {
      try {
        const codeLines = (text || "").split('\n');
        const textWithLineNumbers = codeLines.map((line, idx) => `${idx + 1}| ${line}`).join('\n');
        let contents: any = text ? `Analyze this code (Line numbers provided at start of each line):\n${textWithLineNumbers}` : "Trace code.";

        if (image) {
          const imageBase64 = await fileToGenerativePart(image);
          contents = {
            parts: [
              { inlineData: { mimeType: image.type, data: imageBase64 } },
              { text: text ? `Analyze this code:\n${textWithLineNumbers}` : "Trace the code logic." }
            ]
          };
        }

        const response = await ai.models.generateContent({
          model: apiModelName,
          contents: contents,
          config: {
            systemInstruction: systemInstruction,
            responseMimeType: "application/json",
            // @ts-ignore
            responseSchema: jsonSchema,
            safetySettings: SAFETY_SETTINGS
          }
        });

        const jsonText = response.text || "{}";
        const parsed = JSON.parse(jsonText);

        // Transformation: Convert Array-based variables back to Record<string, {value, type}> for Frontend
        if (parsed.steps && Array.isArray(parsed.steps)) {
          parsed.steps = parsed.steps.map((step: any) => {
            const varRecord: Record<string, any> = {};
            if (step.variables && Array.isArray(step.variables)) {
              step.variables.forEach((v: any) => {
                if (v.name) {
                  // NORMALIZATION: Enforce Scalar Values for non-collection types
                  let finalValue = v.value;
                  let finalHistory = v.history;

                  const isCollection = ['list', 'dict', 'set', 'tuple', 'array', 'object', 'map'].some(t => (v.type || '').toLowerCase().includes(t));

                  // If it's NOT a collection, but the value looks like a list "[...]"
                  if (!isCollection && typeof v.value === 'string' && v.value.trim().startsWith('[') && v.value.trim().endsWith(']')) {
                    try {
                      // Attempt to parse the "accidental list"
                      const safeStr = v.value.replace(/None/g, 'null').replace(/True/g, 'true').replace(/False/g, 'false').replace(/'/g, '"');
                      const parsedList = JSON.parse(safeStr);

                      if (Array.isArray(parsedList) && parsedList.length > 0) {
                        // It IS a list. We must fix this.
                        // 1. Promote this list to 'history' (if history is empty)
                        if (!finalHistory || !Array.isArray(finalHistory)) {
                          finalHistory = parsedList.map(item => String(item));
                        }
                        // 2. Set 'value' to the LAST element (Scalar)
                        finalValue = String(parsedList[parsedList.length - 1]);
                      }
                    } catch (e) {
                      // Parsing failed, keep original value
                    }
                  }

                  varRecord[v.name] = { value: finalValue, type: v.type, history: finalHistory };
                }
              });
            }

            // Transform loop_stack if present
            let transformedLoopStack = undefined;
            if (step.loop_stack && Array.isArray(step.loop_stack)) {
              transformedLoopStack = step.loop_stack.map((stackItem: any) => {
                const stackVars: Record<string, any> = {};
                if (stackItem.variables && Array.isArray(stackItem.variables)) {
                  stackItem.variables.forEach((v: any) => {
                    if (v.name) {
                      // NORMALIZATION for Loop Stack
                      let finalValue = v.value;
                      let finalHistory = v.history;
                      const isCollection = ['list', 'dict', 'set', 'tuple', 'array', 'object', 'map'].some(t => (v.type || '').toLowerCase().includes(t));

                      if (!isCollection && typeof v.value === 'string' && v.value.trim().startsWith('[') && v.value.trim().endsWith(']')) {
                        try {
                          const safeStr = v.value.replace(/None/g, 'null').replace(/True/g, 'true').replace(/False/g, 'false').replace(/'/g, '"');
                          const parsedList = JSON.parse(safeStr);
                          if (Array.isArray(parsedList) && parsedList.length > 0) {
                            if (!finalHistory || !Array.isArray(finalHistory)) {
                              finalHistory = parsedList.map(item => String(item));
                            }
                            finalValue = String(parsedList[parsedList.length - 1]);
                          }
                        } catch (e) { }
                      }
                      stackVars[v.name] = { value: finalValue, type: v.type, history: finalHistory };
                    }
                  });
                }
                return { ...stackItem, variables: stackVars };
              });
            }

            return { ...step, variables: varRecord, loop_stack: transformedLoopStack };
          });

          // Post-processing: Remove non-productive logical termination steps
          // We filter out the LAST step if it looks like a "Loop finished" or "Block ended" step with NO changes.
          if (parsed.steps.length > 1) {
            const lastStep = parsed.steps[parsed.steps.length - 1];
            const prevStep = parsed.steps[parsed.steps.length - 2];

            // Check 1: Explanation matches common termination phrases
            const isTerminationExplan = /finish|ends|exhausted|complete|terminates|condition false|exiting|leaving block|final check|no more inputs|program ends|execution completes|processed all|check condition/i.test(lastStep.explanation || "");

            // Check 2: No new variables changed (Smart Check)
            // Reconstruct state to verify if last step actually changes anything
            let hasRealVarChange = false;
            const knownState: Record<string, string> = {};
            for (let i = 0; i < parsed.steps.length - 1; i++) {
              const s = parsed.steps[i];
              if (s.variables) {
                for (const [key, valObj] of Object.entries(s.variables)) {
                  // @ts-ignore
                  knownState[key] = valObj.value;
                }
              }
            }
            const lastVars = lastStep.variables || {};
            if (Object.keys(lastVars).length > 0) {
              for (const [key, valObj] of Object.entries(lastVars)) {
                // @ts-ignore
                const newVal = valObj.value;
                if (knownState[key] !== newVal) {
                  hasRealVarChange = true;
                  break;
                }
              }
            }
            const noVarChanges = !hasRealVarChange;

            // Check 3: No new output (output is same as previous)
            const noNewOutput = (lastStep.output || "").trim() === (prevStep.output || "").trim();

            if (isTerminationExplan && noVarChanges && noNewOutput) {
              // Safe to remove this "fluff" step
              parsed.steps.pop();
            }
          }
        }

        return parsed;
      } catch (e) {
        console.warn("Decode attempt failed", e);
        throw e; // Trigger retry
      }
    }).catch(e => {
      safeLogger.error("Decode JSON Final Error", e);
      return { flowchartMermaid: "", steps: [], line_explanations: {} };
    });
  }

  // Handle Translate specific logic
  if (task === TabId.Translate) {
    // ... (Rest of Translate logic, verified to be safe)
    const systemInstruction = `You are a polyglot programmer. Translate the provided code${inputLanguage ? ` (Language: ${inputLanguage})` : ""} into ${targetLanguage || 'Java'}.
    
    **Return a JSON object with:**
    - "translatedCode": The translated source code.
    - "confidenceScore": A percentage string (e.g. "90%") indicating confidence in the translation accuracy.
    - "securityScore": A percentage string (e.g. "95%") indicating the security level of the generated code.
`;

    const jsonSchema = {
      type: Type.OBJECT,
      properties: {
        translatedCode: { type: Type.STRING },
        confidenceScore: { type: Type.STRING },
        securityScore: { type: Type.STRING }
      }
    };

    return retryOperation(async () => {
      let contents: any = text || "Translate this code.";
      if (image) {
        const imageBase64 = await fileToGenerativePart(image);
        contents = {
          parts: [
            { inlineData: { mimeType: image.type, data: imageBase64 } },
            { text: text || "Translate the code in this image." }
          ]
        };
      }

      const response = await ai.models.generateContent({
        model: apiModelName,
        contents: contents,
        config: {
          systemInstruction,
          responseMimeType: "application/json",
          // @ts-ignore
          responseSchema: jsonSchema,
          safetySettings: SAFETY_SETTINGS
        }
      });
      return JSON.parse(response.text || "{}");
    });
  }

  // Handle Optimize specifically
  if (task === TabId.Optimize) {
    const systemInstruction = `You are a performance optimization expert. Analyze the provided code${inputLanguage ? ` (Language: ${inputLanguage})` : ""} for time and space complexity issues.
    
    **Return a JSON object with:**
    - "optimizedCode": The optimized version of the code. IMPORTANT: Include comments within the code (starting with # or //) that explain the improvements and summary of changes. Do not output markdown code blocks, just the raw code string.
    
    Focus on readability and performance.`;

    const jsonSchema = {
      type: Type.OBJECT,
      properties: { optimizedCode: { type: Type.STRING } }
    };

    return retryOperation(async () => {
      // ... simplified for brevity, assume similar structure to others
      let contents: any = text || "Optimize this code.";
      if (image) {
        const imageBase64 = await fileToGenerativePart(image);
        contents = { parts: [{ inlineData: { mimeType: image.type, data: imageBase64 } }, { text: text || "Optimize the code in this image." }] };
      }
      const response = await ai.models.generateContent({
        model: apiModelName,
        contents,
        config: { systemInstruction, responseMimeType: "application/json", responseSchema: jsonSchema as any, safetySettings: SAFETY_SETTINGS }
      });
      return JSON.parse(response.text || "{}");
    });
  }

  // Handle OCR
  if (task === TabId.OCR) {
    // ... Existing OCR prompt ...
    const ocrSystemInstruction = `**Role:**
You are an advanced Code OCR (Optical Character Recognition) and Syntax Correction engine.

**Task:**
I will provide you with a sequence of [1 to 5] images. These images are screenshots of a SINGLE source code file, taken in sequential order. Your job is to extract the code, concatenate it, and format it perfectly.

**Input parameters:**
Target Language: ${inputLanguage || 'Python'}

**Strict Rules for Extraction:**
1. **Sequential Merge:** Treat the images as a continuous stream. The code at the bottom of Image 1 flows directly into the top of Image 2. Ensure no logic is lost or duplicated at the "seams" between images.
2. **Ignore Artifacts:** Do NOT transcribe line numbers, scroll bars, window titles, or watermark text present in the screenshots. Extract ONLY the actual code.
3. **Syntax Correction:**
   - Detect and fix obvious OCR errors (e.g., confusing '1' with 'l', or '0' with 'O').
   - Ensure the code adheres to the syntax rules of the **Target Language**.
   - If a line of code is cut off in the middle of a variable name or keyword at the end of an image, reconstruction it correctly using the context from the next image.
4. **Formatting:**
   - Apply standard indentation (e.g., PEP8 for Python, standard bracing for Java/C++) automatically.
   - Ensure proper line breaks.

**Output Format:**
Return ONLY the raw code string. Do not include markdown formatting (like \`\`\` code \`\`\`), explanation text, or preambles. Just the clean, compile-ready code.`;

    return retryOperation(async () => {
      const parts: any[] = [];
      if (uploadedImages && uploadedImages.length > 0) {
        for (const img of uploadedImages) {
          const base64 = await fileToGenerativePart(img);
          parts.push({ inlineData: { mimeType: img.type, data: base64 } });
        }
      } else if (image) {
        const base64 = await fileToGenerativePart(image);
        parts.push({ inlineData: { mimeType: image.type, data: base64 } });
      }
      parts.push({ text: `Target Language: ${inputLanguage || 'Python'}` });

      const response = await ai.models.generateContent({
        model: apiModelName,
        contents: { parts },
        config: { systemInstruction: ocrSystemInstruction, safetySettings: SAFETY_SETTINGS }
      });
      return response.text || "";
    });
  }

  // Standard Summarize
  if (task === TabId.Summarize) {
    // ... Existing Summarize Prompt ...
    const inputValsStr = inputValues ? Object.entries(inputValues).map(([k, v]) => `${k} = ${v}`).join(', ') : "None provided";

    const summaryInstruction = `You are a friendly coding tutor explaining to a beginner for the ${inputLanguage || 'programming'} language.
    
    **Objective:** 
    Analyze the code, mentally execute it step-by-step to calculate the exact output, and then provide a structured, easy-to-understand summary.
    
    **Process (Thinking First):**
    1. **Execution Trace:** First, you must perform a detailed mental trace of the code.
       - **Inputs:** Use the provided User Inputs: [${inputValsStr}].
       - **OVERRIDE RULE (CRITICAL):** If the code initializes a variable (e.g. 'DECLARE @x', 'x = 5', 'int x = 5') that is ALSO present in the User Inputs, you must **IGNORE** the value in the code and use the **User Input** value instead. The User Inputs are runtime overrides.
       - Write this trace down in the 'scratchpad_execution_trace' field.
    2. **Calculate Output:** Based *only* on your trace (using the overridden values), determine the exact string that would be printed to the console.
    3. **Summarize:** After executing, explain "What" the code does (1 point) and "How" it does it (4-5 points) in logic terms a non-technical person would understand.
    
    **Styling & Conciseness Rules (STRICT):**
    - **Concrete Values:** Use ACTUAL runtime values from your trace in the explanation, not abstract variables. (e.g. Say "while apples is less than <v>10</v>" instead of "while a < n").
    - **Simple & Clear Style:** usage simple, everyday language. Avoid overly technical jargon where possible. Start bullet points with natural verbs (e.g. "Sets", "Checks", "Adds", "Shows").
    - **Conciseness:** Keep "How" bullet points EXTREMELY short and direct (max 10 words). Use "telegraphic" style (e.g. "Initializes count to 0" not "The code initializes the count variable to 0").
    - **Styling:** You MUST wrap code elements in specific tags within your strings to highlight them:
      - Variables: '<var>variableName</var>' (e.g. <var>userCount</var>)
      - Keywords / Logic: '<k>if</k>', '<k>loop</k>', '<k>check</k>'
      - Values / Numbers / Strings: '<v>5</v>', '<v>"hello"</v>'
      - User Inputs: '<v>input_value</v>'
      - Functions / Classes: '<f>funcName</f>'
      - Output Values: Wrap numbers/strings/booleans in output with '<v>'.

    **Return a JSON object with:**
    - "scratchpad_execution_trace": string
    - "calculated_output": string (The console output. IMPORTANT: You MUST syntax-highlight this string by wrapping all numbers, strings, and boolean values in '<v>' tags. Example: "Result: <v>42</v>")
    - "summary_what": string (e.g. "Calculates the total price for <v>5</v> items.")
    - "summary_how": string[] (e.g. ["Sets the <var>count</var> to <v>0</v>.", "Adds <v>1</v> to <var>count</var> five times."])
    `;

    const jsonSchema = {
      type: Type.OBJECT,
      properties: {
        scratchpad_execution_trace: { type: Type.STRING },
        calculated_output: { type: Type.STRING },
        summary_what: { type: Type.STRING },
        summary_how: { type: Type.ARRAY, items: { type: Type.STRING } }
      },
      required: ["scratchpad_execution_trace", "calculated_output", "summary_what", "summary_how"]
    };

    return retryOperation(async () => {
      const prompt = text ? `Analyze this code:\n\`\`\`${inputLanguage || ''}\n${text}\n\`\`\`` : `Analyze the attached image.`;
      let contents: any = prompt;
      if (image) {
        const imageBase64 = await fileToGenerativePart(image);
        contents = { parts: [{ inlineData: { mimeType: image.type, data: imageBase64 } }, { text: prompt }] };
      }
      const response = await ai.models.generateContent({
        model: apiModelName,
        contents,
        config: {
          systemInstruction: summaryInstruction,
          responseMimeType: "application/json",
          // @ts-ignore
          responseSchema: jsonSchema as any,
          safetySettings: SAFETY_SETTINGS
        }
      });
      const data = JSON.parse(response.text || "{}");

      // Inlining the format helper logic is annoying here, so we assume the caller handles the raw data? 
      // Wait, the original code returned HTML string constructed from JSON.
      // I should preserve that logic.
      // ... (restoring HTML construction logic below) ...
      const formatBytes = (str: string) => {
        if (!str) return "";
        return str
          .replace(/\*\*(.*?)\*\*/g, '<span class="font-bold text-slate-800 dark:text-slate-100">$1</span>') // Handle markdown bold
          .replace(/<var>/g, '<span class="font-bold text-amber-600 dark:text-amber-400">')
          .replace(/<\/var>/g, '</span>')
          .replace(/<k>/g, '<span class="font-bold text-purple-600 dark:text-purple-400">')
          .replace(/<\/k>/g, '</span>')
          .replace(/<v>/g, '<span class="font-bold text-emerald-600 dark:text-emerald-400">')
          .replace(/<\/v>/g, '</span>')
          .replace(/<f>/g, '<span class="font-bold text-blue-600 dark:text-blue-400">')
          .replace(/<\/f>/g, '</span>');
      };

      return `
            <div class="space-y-6">
                <div>
                    <h3 class="font-bold text-lg mb-2 text-slate-800 dark:text-slate-100">Overall Working</h3>
                    <ul class="list-disc pl-4 space-y-1 text-slate-700 dark:text-slate-300">
                        <li class="font-semibold text-primary dark:text-primary-light mb-2">
                            ${formatBytes(data.summary_what) || "Analyzes the provided code."}
                        </li>
                        ${(data.summary_how || []).map((step: string) => `
                            <li>${formatBytes(step)}</li>
                        `).join('')}
                    </ul>
                </div>

                <div>
                        <h3 class="font-bold text-lg mb-2 text-slate-800 dark:text-slate-100">Code Output</h3>
                        <div class="p-3 bg-slate-100 dark:bg-slate-800 rounded-lg font-mono text-sm text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 overflow-x-auto whitespace-pre-wrap">${formatBytes(data.calculated_output) || "No output produced."}</div>
                </div>
            </div>
            `;
    });
  }

  // Fallback (Generic)
  return retryOperation(async () => {
    const timestamp = new Date().getTime();
    const prompt = text ? `[RequestID: ${timestamp}] Analyze this code.` : `[RequestID: ${timestamp}] Analyze the attached image.`;
    let response: GenerateContentResponse;
    if (image) {
      const imageBase64 = await fileToGenerativePart(image);
      response = await ai.models.generateContent({
        model: apiModelName,
        contents: { parts: [{ inlineData: { mimeType: image.type, data: imageBase64 } }, { text: prompt }] },
        config: { safetySettings: SAFETY_SETTINGS }
      });
    } else {
      response = await ai.models.generateContent({
        model: apiModelName,
        contents: prompt,
        config: { safetySettings: SAFETY_SETTINGS }
      });
    }
    return response.text || "No output generated.";
  }).catch((e: Error) => `Error: ${e.message}`);
};