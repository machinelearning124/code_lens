import React, { useRef, useEffect, useCallback } from 'react';
import { TabId, TabData, InputType, TabPanelProps } from '../types';
import { LANGUAGES, INITIAL_TAB_DATA } from '../constants';
import { runGemini } from '../services/geminiService';

import DecodeView from './DecodeView';
import TranslateView from './TranslateView';
import OptimizeView from './OptimizeView';
import CodeEditor from './CodeEditor';
import { inputDetectionService } from '../services/inputDetectionService';
import { logicMapService } from '../services/logicMapService';

const TabPanel: React.FC<TabPanelProps> = ({
    activeTab,
    data,
    updateData,
    setAppState,
    onClear,
    model,
    apiKey
}) => {
    const fileInputRef = useRef<HTMLInputElement>(null);



    // Handle Input Type Change (Radio Buttons)
    const handleTypeChange = (type: InputType) => {
        updateData({
            inputType: type,
            codeText: '',
            imageFile: null,
            imagePreviewUrl: null,
            output: '',
            decodeResult: null,
            translateResult: null,
            optimizeResult: null,
            uploadedImages: [],
            isOCRCompleted: false,
            isExtracting: false,
            detectedInputs: [],
            inputValues: {},
            inputsConfirmed: false
        });

        // Requirement: If switching inputs in Code Overview (Summarize), ALSO reset Decode Logic tab
        if (activeTab === TabId.Summarize) {
            setAppState(prev => ({
                ...prev,
                [TabId.Decode]: { ...INITIAL_TAB_DATA }
            }));
        }
    };

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || !e.target.files.length) return;

        const newFiles = Array.from(e.target.files) as File[];
        const currentImages = (data.uploadedImages || []) as { id: string; file: File; previewUrl: string }[];

        if (currentImages.length + newFiles.length > 5) {
            alert("Maximum 5 images allowed.");
            return;
        }

        const newEntries: { id: string; file: File; previewUrl: string }[] = [];
        let duplicateFound = false;

        for (const file of newFiles) {
            // Duplicate Check (Name + Size) against existing
            const isDuplicate = currentImages.some(img => img.file.name === file.name && img.file.size === file.size);
            // Also check against new batch
            const isInBatch = newEntries.some(entry => entry.file.name === file.name && entry.file.size === file.size);

            if (!isDuplicate && !isInBatch) {
                newEntries.push({
                    id: Math.random().toString(36).substr(2, 9),
                    file,
                    previewUrl: URL.createObjectURL(file)
                });
            } else {
                duplicateFound = true;
            }
        }

        if (duplicateFound) {
            alert("Image already uploaded");
        }

        if (newEntries.length > 0) {
            updateData({ uploadedImages: [...currentImages, ...newEntries] });
        }

        // Reset input
        if (e.target) e.target.value = '';
    };

    const handleReplaceImage = (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            const newUrl = URL.createObjectURL(file);
            const newImages = [...(data.uploadedImages || [])];

            if (newImages[index].previewUrl) URL.revokeObjectURL(newImages[index].previewUrl);

            newImages[index] = { ...newImages[index], file, previewUrl: newUrl };
            updateData({ uploadedImages: newImages });
        }
        if (e.target) e.target.value = '';
    };

    const handleRemoveImage = (index: number) => {
        const newImages = [...(data.uploadedImages || [])];
        if (newImages[index].previewUrl) URL.revokeObjectURL(newImages[index].previewUrl);
        newImages.splice(index, 1);
        updateData({ uploadedImages: newImages });
    };

    const handleOCR = async () => {
        if (!apiKey) {
            alert("Enter valid API key first. Then click Done Again");
            return;
        }

        const images = data.uploadedImages;
        if (!images || images.length === 0) return;

        updateData({ isExtracting: true });

        try {
            const result = await runGemini(
                TabId.OCR,
                '',
                null,
                undefined,
                model,
                apiKey,
                data.inputLanguage,
                images.map(img => img.file)
            );

            // Success Transition: Keep type 'image' but show editor
            updateData({
                isExtracting: false,
                codeText: result,
                uploadedImages: [],
                isOCRCompleted: true,
                detectedInputs: [], // Will be re-detected by effect
                inputValues: {},
                inputsConfirmed: false
            });

            // Cleanup URLs
            images.forEach(img => URL.revokeObjectURL(img.previewUrl));

        } catch (error) {
            updateData({
                isExtracting: false,
                output: `OCR Error: ${error instanceof Error ? error.message : String(error)}`
            });
        }
    };

    const handleDownload = () => {
        if (!data.output) return;
        const blob = new Blob([data.output], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${activeTab}_output.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const handleRun = async () => {
        if (!apiKey) {
            let actionName = 'Generate Overview';
            if (activeTab === TabId.Decode) actionName = 'Decode Logic'; // Button text is Decode? Check line 654
            else if (activeTab === TabId.Translate) actionName = 'Translate';
            else if (activeTab === TabId.Optimize) actionName = 'Optimize';

            // Refine based on actual button text if needed, but "Generate Overview" was requested.
            // Button label logic (lines 653-655):
            // Summarize -> 'Generate Overview'
            // Decode -> 'Decode'
            // Translate -> 'Translate'
            // Optimize -> 'optimize'

            const btnLabel = activeTab === TabId.Summarize ? 'Generate Overview' :
                activeTab === TabId.Decode ? 'Decode' : // Actually let's stick to the requested pattern
                    activeTab === TabId.Translate ? 'Translate' : 'Optimize';

            alert(`Enter valid API key first. Then click ${btnLabel} Again`);
            return;
        }

        updateData({ isLoading: true });

        try {
            // Helper to format arrays/matrices recursively (Shared across tabs)
            const formatArrayData = (jsonStr: string): string => {
                try {
                    const safeJson = jsonStr.replace(/'/g, '"').replace(/\bNone\b/g, 'null').replace(/\bTrue\b/g, 'true').replace(/\bFalse\b/g, 'false');
                    const parsedData = JSON.parse(safeJson);
                    if (!Array.isArray(parsedData)) return jsonStr;

                    const renderRecursive = (arr: any[], depth: number): string => {
                        // Leaf nodes (1D array)
                        if (arr.every(item => !Array.isArray(item))) return `<span class="font-mono text-xs">[${arr.join(', ')}]</span>`;

                        // 2D Matrix -> Table
                        if (arr.every(item => Array.isArray(item) && item.every((sub: any) => !Array.isArray(sub)))) {
                            const rows = arr.map((row: any[]) => `<tr>${row.map(cell => `<td class="border border-slate-300 dark:border-slate-600 p-1 text-center min-w-[24px]">${cell}</td>`).join('')}</tr>`).join('');
                            return `<table class="border-collapse my-2 bg-white/50 dark:bg-slate-800/50 rounded overflow-hidden text-xs mx-auto shadow-sm">${rows}</table>`;
                        }

                        // Higher Dimensions (Recursive Lists)
                        return arr.map((subArr, idx) => {
                            const label = (depth === 0 && Array.isArray(subArr) && Array.isArray(subArr[0])) ? `Layer ${idx}` : `Index ${idx}`;
                            return `<div class="my-2 pl-2 border-l-2 border-primary/20"><div class="text-[10px] uppercase font-bold text-slate-400 mb-1">${label}</div>${renderRecursive(subArr, depth + 1)}</div>`
                        }).join('');
                    };
                    return renderRecursive(parsedData, 0);
                } catch (e) { return jsonStr; }
            };

            // Helper to convert styling tags (<v>, <val>, <k>, <f>) into styled HTML
            const formatStyleTags = (str: string): string => {
                if (!str) return "";
                return str
                    .replace(/<val>/g, '<span class="font-bold text-emerald-600 dark:text-emerald-400">')
                    .replace(/<\/val>/g, '</span>')
                    .replace(/<v>/g, '<span class="font-bold text-slate-700 dark:text-slate-200">')
                    .replace(/<\/v>/g, '</span>')
                    .replace(/<k>/g, '<span class="font-bold text-rose-600 dark:text-rose-400">')
                    .replace(/<\/k>/g, '</span>')
                    .replace(/<f>/g, '<span class="font-bold text-blue-600 dark:text-blue-400">')
                    .replace(/<\/f>/g, '</span>');
            };

            // Case 1: Summarize Tab -> Triggers Summarize AND Decode population
            if (activeTab === TabId.Summarize) {
                const code = data.codeText;
                const img = (data.inputType === 'image' && !data.isOCRCompleted) ? data.imageFile : null;
                const lang = data.inputLanguage;

                const summaryPromise = runGemini(TabId.Summarize, code, img, undefined, model, apiKey, lang, undefined, data.inputValues);



                // Decode Logic: Local Pyodide for Python, Gemini for others
                let decodePromise;
                let geminiExplPromise = Promise.resolve(null); // Default

                // Removed Pyodide pre-fetch logic in favor of unified Gemini Simulation in Decode Tab
                // Unified Background Decode (Pre-fetch) using Gemini for ALL languages
                decodePromise = runGemini(TabId.Decode, code, img, undefined, model, apiKey, lang, undefined, data.inputValues)
                    .catch(e => { console.warn("Background Decode Failed", e); return null; });

                const [summaryResult, decodeResultRaw, geminiData] = await Promise.all([summaryPromise, decodePromise, geminiExplPromise]);

                // Update Summarize Tab (Current)
                updateData({ output: summaryResult, isLoading: false });

                // Update Decode Tab (Background)
                if (decodeResultRaw && typeof decodeResultRaw === 'object') {
                    // Logic similar to below but simplified since Gemini does the heavy lifting
                    let finalSteps = decodeResultRaw.steps || [];
                    // Normalize variables if needed (though geminiService does it)
                    finalSteps = finalSteps.map((s: any) => {
                        // Ensure variables are in {value, type} format
                        let vars = s.variables;
                        if (typeof vars === 'string') { try { vars = JSON.parse(vars); } catch (e) { } }
                        // If it's already Record<string, {value, type}>, great. If not (old/fallback), fix it.
                        // But assuming geminiService is updated, we trust it.
                        return { ...s, variables: vars, blockId: `L${s.line}` };
                    });

                    // Generate Logic Map locally for background update
                    const bgMermaidSvg = await logicMapService.generateDiagram(code, lang);

                    setAppState(prev => ({
                        ...prev,
                        [TabId.Decode]: {
                            ...prev[TabId.Decode],
                            inputType: data.inputType,
                            inputLanguage: data.inputLanguage,
                            codeText: data.codeText,
                            imageFile: data.imageFile,
                            imagePreviewUrl: data.imagePreviewUrl,
                            decodeResult: {
                                steps: finalSteps,
                                flowchartMermaid: bgMermaidSvg,
                                totalSteps: finalSteps.length
                            },
                            currentStepIndex: 0,
                            isLoading: false
                        }
                    }));
                }
            }
            // Case 2: Decode Tab (All Languages via Gemini Simulation)
            else if (activeTab === TabId.Decode) {
                const code = data.codeText;
                const img = (data.inputType === 'image' && !data.isOCRCompleted) ? data.imageFile : null;
                const lang = data.inputLanguage;

                // Unified Gemini Simulation for ALL languages (Python, Java, SQL, etc.)
                const geminiResult = await runGemini(TabId.Decode, code, img, undefined, model, apiKey, lang);

                if (geminiResult?.steps && Array.isArray(geminiResult.steps)) {

                    // Use Gemini's simulated steps directly
                    const steps = geminiResult.steps.map((s: any, idx: number) => {

                        // 1. Output is CUMULATIVE from Gemini now. No need to accumulate manually.
                        let output = s.output || "";

                        // 2. Variables: Gemini returns ARRAY [{name, value, type}], we need Record<name, {value, type}>
                        let normalizedVars: Record<string, { value: string, type: string }> = {};
                        const rawVars = s.variables || [];
                        if (Array.isArray(rawVars)) {
                            rawVars.forEach((v: any) => {
                                if (v && v.name) {
                                    normalizedVars[v.name] = { value: String(v.value), type: v.type || 'unknown' };
                                }
                            });
                        } else if (typeof rawVars === 'object') {
                            // Already a record (legacy or direct)
                            normalizedVars = rawVars;
                        }

                        // Pass through without double stringifying
                        return {
                            step: s.step || idx + 1,
                            line: s.line,
                            explanation: s.explanation || "", // Let DecodeView handle style tags
                            variables: normalizedVars,
                            output: output,
                            blockId: `L${s.line}`
                        };
                    });


                    // GENERATE DETERMINISTIC LOGIC MAP (Client-Side)
                    const mermaidSvg = await logicMapService.generateDiagram(code, lang);

                    updateData({
                        decodeResult: {
                            steps,
                            flowchartMermaid: mermaidSvg,
                            totalSteps: steps.length
                        },
                        currentStepIndex: 0,
                        isLoading: false
                    });
                } else {
                    updateData({
                        output: "Could not generate execution trace. Please try again.",
                        isLoading: false
                    });
                }
            }
            // Case 3: Translate Tab (Manual Run)
            else if (activeTab === TabId.Translate) {
                const result = await runGemini(
                    TabId.Translate,
                    data.codeText,
                    (data.inputType === 'image' && !data.isOCRCompleted) ? data.imageFile : null,
                    data.targetLanguage,
                    model,
                    apiKey,
                    data.inputLanguage
                );

                if (typeof result === 'object') {
                    updateData({
                        translateResult: result,
                        isLoading: false
                    });
                } else {
                    // Fallback for simple text response if JSON fails
                    updateData({ output: result, isLoading: false });
                }
            }
            // Case 4: Optimize Tab (Manual Run)
            else if (activeTab === TabId.Optimize) {
                const result = await runGemini(
                    TabId.Optimize,
                    data.codeText,
                    (data.inputType === 'image' && !data.isOCRCompleted) ? data.imageFile : null,
                    undefined,
                    model,
                    apiKey,
                    data.inputLanguage
                );

                if (typeof result === 'object') {
                    updateData({
                        optimizeResult: result,
                        isLoading: false
                    });
                } else {
                    updateData({ output: result, isLoading: false });
                }
            }
            // Case 5: Other Tabs (Fallback)
            else {
                const result = await runGemini(
                    activeTab,
                    data.codeText,
                    (data.inputType === 'image' && !data.isOCRCompleted) ? data.imageFile : null,
                    data.targetLanguage,
                    model,
                    apiKey,
                    data.inputLanguage
                );
                updateData({ output: result, isLoading: false });
            }

        } catch (error) {
            updateData({ output: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`, isLoading: false });
        }
    };

    const getTitle = () => {
        switch (activeTab) {
            case TabId.Summarize: return 'Code Overview';
            case TabId.Decode: return 'Decode Logic';
            case TabId.Translate: return 'Translate Code';
            case TabId.Optimize: return 'Optimize Code';
        }
    };

    const getDescription = () => {
        switch (activeTab) {
            case TabId.Summarize: return 'Get high-level explanation of source code.';
            case TabId.Decode: return 'Step-by-step code execution analysis.';
            case TabId.Translate: return 'Convert code between languages.';
            case TabId.Optimize: return 'Generate optimized code.';
        }
    };

    const getIcon = () => {
        switch (activeTab) {
            case TabId.Summarize: return 'analytics';
            case TabId.Decode: return 'code';
            case TabId.Translate: return 'translate';
            case TabId.Optimize: return 'rocket_launch';
        }
    };

    const [isSyntaxValid, setIsSyntaxValid] = React.useState(true);

    // Detect inputs when code changes
    useEffect(() => {
        if (data.codeText) {
            const inputs = inputDetectionService.detectInputs(data.codeText, data.inputLanguage || 'python');

            // Only update if inputs changed to avoid infinite loops/resets
            const currentInputs = data.detectedInputs || [];
            if (JSON.stringify(inputs) !== JSON.stringify(currentInputs)) {
                updateData({
                    detectedInputs: inputs,
                    // Reset confirmation if new inputs detected, unless we want to persist matching values? 
                    // For safety, let's reset to force review if structure changes.
                    inputsConfirmed: inputs.length === 0,
                    // Preserve existing values if variable names match
                    inputValues: data.inputValues || {}
                });
            }
        } else {
            updateData({ detectedInputs: [], inputsConfirmed: true });
        }
    }, [data.codeText, data.inputLanguage]);

    const handleConfirmInputs = () => {
        updateData({ inputsConfirmed: true });
    };

    const handleEditInputs = () => {
        updateData({ inputsConfirmed: false });
    };

    const handleInputChange = (variable: string, value: string) => {
        updateData({
            inputValues: {
                ...data.inputValues,
                [variable]: value
            }
        });
    };

    // Check if a single input is valid based on its type
    const validateInput = (value: string, type: string): boolean => {
        if (!value) return false;
        if (type === 'int') {
            return /^-?\d+$/.test(value);
        }
        if (type === 'float') {
            return /^-?\d*(\.\d+)?$/.test(value) && !isNaN(parseFloat(value));
        }
        if (type === 'bool') {
            return ['true', 'false', '1', '0', 'yes', 'no'].includes(value.toLowerCase());
        }
        return true;
    };

    // Check if all inputs have values AND are valid types
    const areInputsValid = () => {
        if (!data.detectedInputs || data.detectedInputs.length === 0) return true;
        return data.detectedInputs.every(v => {
            const val = data.inputValues?.[v.name];
            return val && validateInput(val, v.type);
        });
    };

    // Disable button if: loading, no input, SYNTAX ERROR, or INPUTS INVALID
    const isDisabled = data.isLoading || data.isExtracting ||
        (data.inputType === 'text' && (!data.codeText || !isSyntaxValid)) ||
        (data.inputType === 'image' && !data.isOCRCompleted && !data.imageFile) ||
        (data.inputType === 'image' && data.isOCRCompleted && (!data.codeText || !isSyntaxValid)) ||
        (data.detectedInputs && data.detectedInputs.length > 0 && !areInputsValid());

    // ALWAYS Render Decode View for Decode Tab
    if (activeTab === TabId.Decode) {
        return (
            <main className="flex-1 flex flex-col h-full relative overflow-hidden bg-background-light dark:bg-background-dark">
                <DecodeView
                    data={data}
                    updateData={updateData}
                    onRun={handleRun}
                    onClear={onClear}
                />
            </main>
        );
    }

    // ALWAYS Render Translate View for Translate Tab
    if (activeTab === TabId.Translate) {
        return (
            <main className="flex-1 flex flex-col h-full relative overflow-hidden bg-background-light dark:bg-background-dark">
                <TranslateView
                    data={data}
                    updateData={updateData}
                    onRun={handleRun}
                    onClear={onClear}
                />
            </main>
        );
    }

    // ALWAYS Render Optimize View for Optimize Tab
    if (activeTab === TabId.Optimize) {
        return (
            <main className="flex-1 flex flex-col h-full relative overflow-hidden bg-background-light dark:bg-background-dark">
                <OptimizeView
                    data={data}
                    updateData={updateData}
                    onRun={handleRun}
                    onClear={onClear}
                />
            </main>
        );
    }

    // Default Render for Summarize (and fallback)
    return (
        <main className="flex-1 flex flex-col h-full relative overflow-hidden bg-background-light dark:bg-background-dark">
            {/* Header */}
            <header className="flex-shrink-0 flex justify-between items-start px-8 pt-8 pb-4 z-10">
                <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-3">
                        <span className="p-1.5 glass-pane rounded-lg shadow-sm">
                            <span className="material-icons-round text-lg text-primary">{getIcon()}</span>
                        </span>
                        <h1 className="text-xl font-bold text-slate-900 dark:text-white text-glass-shadow">
                            {getTitle()}
                        </h1>
                    </div>
                    <p className="text-slate-700 dark:text-slate-200 font-medium text-xs ml-[44px] max-w-xl">
                        {getDescription()}
                    </p>
                </div>
                <div className="flex items-center space-x-4">
                    <button
                        onClick={() => document.documentElement.classList.toggle('dark')}
                        className="p-2 rounded-full text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                        title="Toggle Theme"
                    >
                        <span className="material-icons-round dark:hidden">dark_mode</span>
                        <span className="material-icons-round hidden dark:block">light_mode</span>
                    </button>
                    <button
                        onClick={() => {
                            if (window.confirm('Are you sure?')) {
                                onClear();
                            }
                        }}
                        title="Reset Code Overview and Decode Logic tabs"
                        className="flex items-center space-x-2 px-4 py-1.5 text-sm font-semibold text-red-500 glass-pane border border-red-200/30 rounded-lg hover:bg-red-50/50 dark:hover:bg-red-900/20 transition-all shadow-sm hover:shadow-md"
                    >
                        <span className="material-icons-round text-base">delete</span>
                        <span>Clear</span>
                    </button>
                </div>
            </header>

            {/* Content Area - Flex Column to fill space */}
            <div className="flex-1 flex flex-col min-h-0 px-8 overflow-hidden">
                {/* Radio Buttons */}
                <div className="flex-shrink-0 py-6 flex space-x-6 items-center">
                    <label className="inline-flex items-center cursor-pointer group">
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center mr-2 transition-colors ${data.inputType === 'text' ? 'border-primary' : 'border-slate-400 dark:border-slate-500'}`}>
                            {data.inputType === 'text' && <div className="w-3 h-3 bg-primary rounded-full"></div>}
                        </div>
                        <input
                            type="radio"
                            name={`inputType-${activeTab}`}
                            checked={data.inputType === 'text'}
                            onChange={() => handleTypeChange('text')}
                            className="hidden"
                        />
                        <span className={`text-sm font-bold transition-colors ${data.inputType === 'text' ? 'text-primary' : 'text-slate-700 dark:text-slate-200'}`}>Text Code</span>
                    </label>

                    <label className="inline-flex items-center cursor-pointer group">
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center mr-2 transition-colors ${data.inputType === 'image' ? 'border-primary' : 'border-slate-400 dark:border-slate-500'}`}>
                            {data.inputType === 'image' && <div className="w-3 h-3 bg-primary rounded-full"></div>}
                        </div>
                        <input
                            type="radio"
                            name={`inputType-${activeTab}`}
                            checked={data.inputType === 'image'}
                            onChange={() => handleTypeChange('image')}
                            className="hidden"
                        />
                        <span className={`text-sm font-bold transition-colors ${data.inputType === 'image' ? 'text-primary' : 'text-slate-700 dark:text-slate-200'}`}>Image Upload</span>
                    </label>
                </div>

                {/* Main Grid - Fills remaining space */}
                <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-6 min-h-0 pb-6">

                    {/* Left: Input */}
                    <div className="flex flex-col h-full card-neon shadow-2xl">
                        {/* Input Header */}
                        <div className="flex-shrink-0 px-4 py-3 border-b border-white/10 flex justify-between items-center bg-white/30 dark:bg-black/20 backdrop-blur-md">
                            <span className="font-bold text-xs uppercase tracking-wider text-slate-600 dark:text-slate-300">Source Code</span>

                            {/* Input Language Selector */}
                            <div className="flex items-center">


                                <select
                                    value={data.inputLanguage}
                                    onChange={(e) => {
                                        updateData({
                                            inputLanguage: e.target.value,
                                            // Reset everything on language switch
                                            codeText: '',
                                            output: '',
                                            detectedInputs: [],
                                            inputValues: {},
                                            isOCRCompleted: false,
                                            imageFile: null,
                                            imagePreviewUrl: null,
                                            uploadedImages: [],
                                            isLoading: false
                                        });

                                        // Requirement: Reset Decode Logic tab when language changes in Code Overview
                                        // BUT propagate the language and type so it doesn't default to Python/Text
                                        if (activeTab === TabId.Summarize) {
                                            setAppState(prev => ({
                                                ...prev,
                                                [TabId.Decode]: {
                                                    ...INITIAL_TAB_DATA,
                                                    inputLanguage: e.target.value,
                                                    inputType: data.inputType,
                                                    codeText: '' // New language means code likely meaningless or cleared
                                                }
                                            }));
                                        }
                                    }}
                                    className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-md py-1 pl-2 pr-6 text-xs font-bold text-slate-700 dark:text-slate-200 focus:ring-1 focus:ring-primary outline-none cursor-pointer hover:border-slate-300 transition-colors appearance-none"
                                >
                                    {LANGUAGES.map(lang => <option key={lang} value={lang}>{lang}</option>)}
                                </select>
                                <span className="material-icons-round text-sm text-slate-400 -ml-5 pointer-events-none">expand_more</span>
                            </div>
                        </div>

                        {/* Input Content - Flex-1, textarea handles its own scrolling */}
                        <div className="flex-1 relative p-0 bg-white/40 dark:bg-slate-900/20 flex flex-col">



                            {(data.inputType === 'text' || (data.inputType === 'image' && data.isOCRCompleted)) ? (
                                <>
                                    <CodeEditor
                                        key={data.inputType} // Force re-mount to ensure clean Monaco state/options
                                        value={data.codeText}
                                        onChange={(val) => updateData({ codeText: val })}
                                        language={data.inputLanguage || 'python'}
                                        className="flex-1 min-h-0"
                                        onSyntaxChange={setIsSyntaxValid}
                                    />

                                    {/* Inline Variable Panel */}
                                    {data.detectedInputs && data.detectedInputs.length > 0 && (
                                        <div className="flex-shrink-0 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
                                            <div className="px-4 py-2 bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
                                                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-2">
                                                    <span className="material-icons-round text-sm">tune</span>
                                                    Variables ({data.detectedInputs.length})
                                                </h3>
                                                {!areInputsValid() && (
                                                    <span className="text-[10px] font-bold text-amber-500 flex items-center gap-1">
                                                        <span className="material-icons-round text-xs">warning</span>
                                                        Fill all fields
                                                    </span>
                                                )}
                                            </div>

                                            <div className="max-h-32 overflow-y-auto p-2">
                                                <table className="w-full text-xs">
                                                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                                                        {data.detectedInputs.map((input) => {
                                                            const val = data.inputValues?.[input.name] || '';
                                                            const isValid = validateInput(val, input.type);

                                                            return (
                                                                <tr key={input.name} className="group hover:bg-white dark:hover:bg-slate-700/50 transition-colors">
                                                                    <td className="px-3 py-2 font-mono text-slate-600 dark:text-slate-300 w-1/3 align-middle">
                                                                        <div className="flex items-center gap-2">
                                                                            <span className="font-bold">{input.name}</span>
                                                                            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400 uppercase">{input.type}</span>
                                                                        </div>
                                                                    </td>
                                                                    <td className="px-3 py-2 w-2/3">
                                                                        <div className="relative">
                                                                            <input
                                                                                type="text"
                                                                                value={val}
                                                                                onChange={(e) => handleInputChange(input.name, e.target.value)}
                                                                                placeholder={`Enter value...`}
                                                                                className={`w-full px-2 py-1.5 bg-white dark:bg-slate-900 border rounded text-xs focus:ring-1 outline-none transition-all text-slate-700 dark:text-slate-200 placeholder-slate-400
                                                                                    ${val && !isValid
                                                                                        ? 'border-red-500 focus:ring-red-200 focus:border-red-500'
                                                                                        : 'border-slate-200 dark:border-slate-600 focus:ring-primary/50 focus:border-primary'}
                                                                                `}
                                                                            />
                                                                            {val && !isValid && (
                                                                                <span className="absolute right-2 top-1.5 text-red-500 material-icons-round text-xs pointer-events-none" title={`Invalid ${input.type}`}>error</span>
                                                                            )}
                                                                        </div>
                                                                    </td>
                                                                </tr>
                                                            );
                                                        })}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    )}
                                </>
                            ) : (
                                <div className="absolute inset-0 flex flex-col overflow-hidden">
                                    {/* Info Box */}
                                    <div className="bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-300 px-4 py-2 text-xs font-medium border-b border-blue-100 dark:border-blue-800/50 flex items-center justify-center">
                                        <span className="material-icons-round text-sm mr-2">info</span>
                                        Please upload images in the correct sequential order.
                                    </div>

                                    {/* Scrollable List */}
                                    <div className="flex-1 overflow-auto p-4 space-y-4 code-scroll-area">
                                        {(data.uploadedImages || []).map((img, index) => (
                                            <div key={img.id} className="flex items-center gap-4 bg-white dark:bg-slate-800 p-3 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm transition-all hover:shadow-md group relative">

                                                {/* Sequence Label */}
                                                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center font-bold text-slate-500 dark:text-slate-400 text-xs">
                                                    #{index + 1}
                                                </div>

                                                {/* Preview */}
                                                <div className="w-16 h-16 bg-slate-100 dark:bg-slate-900 rounded border border-slate-200 dark:border-slate-700 overflow-hidden relative flex-shrink-0">
                                                    <img src={img.previewUrl} alt={`Page ${index + 1}`} className="w-full h-full object-cover" />
                                                </div>

                                                {/* Info & Actions */}
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 truncate">
                                                        {img.file.name}
                                                    </p>
                                                    <p className="text-xs text-slate-500 dark:text-slate-400">
                                                        {(img.file.size / 1024).toFixed(1)} KB
                                                    </p>
                                                </div>

                                                {/* Replace Button (Hidden Input) */}
                                                <label className="cursor-pointer p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 text-blue-500 transition-colors" title="Replace Image">
                                                    <span className="material-icons-round text-lg">edit</span>
                                                    <input
                                                        type="file"
                                                        accept="image/*"
                                                        className="hidden"
                                                        onChange={(e) => handleReplaceImage(index, e)}
                                                    />
                                                </label>

                                                {/* Remove Button */}
                                                <button
                                                    onClick={() => handleRemoveImage(index)}
                                                    className="p-2 rounded-full hover:bg-red-50 dark:hover:bg-red-900/20 text-slate-400 hover:text-red-500 transition-colors"
                                                    title="Remove Image"
                                                >
                                                    <span className="material-icons-round text-lg">close</span>
                                                </button>
                                            </div>
                                        ))}

                                        {/* Add Button (If < 5) */}
                                        {(!data.uploadedImages || data.uploadedImages.length < 5) && (
                                            <label className="w-full h-32 border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-lg flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer group">
                                                <input
                                                    type="file"
                                                    accept="image/*"
                                                    multiple
                                                    onChange={handleImageUpload}
                                                    className="hidden"
                                                />
                                                <span className="material-icons-round text-4xl text-slate-400 group-hover:text-primary mb-2 transition-colors">add_photo_alternate</span>
                                                <span className="text-sm text-slate-500 group-hover:text-primary font-medium transition-colors">
                                                    Click to upload screenshot
                                                </span>
                                                <span className="text-xs text-slate-400 mt-1">
                                                    {5 - (data.uploadedImages?.length || 0)} slots remaining
                                                </span>
                                            </label>
                                        )}
                                    </div>

                                    {/* Footer: Done Button */}
                                    <div className="p-4 border-t border-slate-200 dark:border-slate-700 bg-white/50 dark:bg-slate-900/50">
                                        <button
                                            onClick={handleOCR}
                                            disabled={!data.uploadedImages || data.uploadedImages.length === 0}
                                            className={`
                                                w-full py-2.5 rounded-lg flex items-center justify-center gap-2 font-bold text-sm transition-all
                                                ${(!data.uploadedImages || data.uploadedImages.length === 0)
                                                    ? 'bg-slate-200 text-slate-400 cursor-not-allowed dark:bg-slate-800 dark:text-slate-600'
                                                    : 'bg-green-500 hover:bg-green-600 text-white shadow-lg hover:shadow-green-500/30 transform active:scale-95'
                                                }
                                            `}
                                        >
                                            {data.isExtracting ? (
                                                <>
                                                    <span className="material-icons-round animate-spin text-lg">refresh</span>
                                                    Extracting Code...
                                                </>
                                            ) : (
                                                <>
                                                    <span className="material-icons-round text-lg">check_circle</span>
                                                    Done
                                                </>
                                            )}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Right: Output */}
                    <div className="flex flex-col h-full card-neon shadow-2xl">
                        <div className="flex-shrink-0 px-4 py-3 border-b border-white/10 flex justify-between items-center bg-white/30 dark:bg-black/20 backdrop-blur-md">
                            <span className="font-bold text-xs uppercase tracking-wider text-slate-600 dark:text-slate-300">
                                {activeTab === TabId.Summarize ? 'Overview' : 'Output'}
                            </span>
                            <div className="flex space-x-1">
                                <button
                                    onClick={() => navigator.clipboard.writeText(data.output)}
                                    className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                                    title="Copy"
                                    disabled={!data.output}
                                >
                                    <span className="material-icons-round text-lg">content_copy</span>
                                </button>
                                <button
                                    onClick={handleDownload}
                                    className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                                    title="Download"
                                    disabled={!data.output}
                                >
                                    <span className="material-icons-round text-lg">download</span>
                                </button>
                            </div>
                        </div>

                        <div className="flex-1 p-0 bg-white/40 dark:bg-slate-900/20 overflow-scroll code-scroll-area relative">
                            {data.isLoading ? (
                                <div className="w-full h-full flex items-center justify-center flex-col bg-white/50 dark:bg-black/20 backdrop-blur-sm">
                                    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary mb-4"></div>
                                    <p className="text-sm font-bold text-slate-900 dark:text-white animate-pulse">
                                        Generating {activeTab} response...
                                    </p>
                                </div>
                            ) : data.output ? (
                                <div
                                    className="p-4 text-sm font-mono whitespace-normal leading-relaxed text-slate-700 dark:text-slate-200 font-medium"
                                    dangerouslySetInnerHTML={{ __html: data.output }}
                                />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center text-center p-8">
                                    <p className="text-sm text-slate-400 dark:text-slate-500 italic">
                                        Code overview appears here.
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Sticky Action Button (Now in a proper footer) */}
            <div className="flex-shrink-0 py-6 border-t border-white/10 flex justify-center z-20">
                <button
                    type="button"
                    onClick={(e) => {
                        e.preventDefault();
                        handleRun();
                    }}
                    disabled={isDisabled}
                    title={!isDisabled && activeTab === TabId.Summarize ? "Click to see code overview" : undefined}
                    className={`
                        flex items-center gap-2 px-8 py-3 rounded-xl 
                        font-bold text-base transition-all transform 
                        ${isDisabled
                            ? 'bg-slate-300 dark:bg-slate-600 text-slate-500 dark:text-slate-300 cursor-not-allowed border-2 border-slate-400 dark:border-slate-500 shadow-md'
                            : 'bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white shadow-xl shadow-violet-500/30 hover:shadow-violet-500/50 hover:scale-105 active:scale-95'
                        }
                    `}
                >
                    {data.isLoading ? (
                        <span className="material-icons-round animate-spin">refresh</span>
                    ) : (
                        <span className="material-icons-round">play_arrow</span>
                    )}
                    Generate Overview
                </button>
            </div>
        </main>
    );
};

export default TabPanel;