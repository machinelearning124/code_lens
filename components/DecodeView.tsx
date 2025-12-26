import React, { useEffect, useRef, useState, useCallback } from 'react';
import { DecodeViewProps, TraceStep } from '../types';
import mermaid from 'mermaid';
import { logicMapService } from '../services/logicMapService';
import Editor, { OnMount } from "@monaco-editor/react";
import * as monaco from 'monaco-editor';
import { VariableCard } from './VariableCard';
import { VariableStateSection } from './VariableStateSection';
import { OutputStateSection } from './OutputStateSection';

const DecodeView: React.FC<DecodeViewProps> = ({ data, updateData, onRun, onClear }) => {
    const { decodeResult, currentStepIndex = 0, codeText, inputLanguage, inputValues } = data;
    const steps = decodeResult?.steps || [];
    const currentStep: Partial<TraceStep> = steps[currentStepIndex] || {};
    const hasResults = !!decodeResult;
    const mermaidRef = useRef<HTMLDivElement>(null);
    const [liveMermaid, setLiveMermaid] = React.useState<string>('');
    const [theme, setTheme] = useState<'light' | 'vs-dark'>('light');
    const [isEditorReady, setIsEditorReady] = useState(false);
    const [zoomLevel, setZoomLevel] = useState(1);
    const defaultZoomRef = useRef(1);

    // Scrollbar Logic (Native Sync)
    const containerRef = useRef<HTMLDivElement>(null);
    const vScrollRef = useRef<HTMLDivElement>(null);
    const hScrollRef = useRef<HTMLDivElement>(null);
    const syncingRef = useRef(false);
    const [scrollDims, setScrollDims] = useState({
        scrollHeight: 0,
        scrollWidth: 0,
        containerHeight: 0,
        containerWidth: 0
    });

    // Theme sync for Monaco
    useEffect(() => {
        const updateTheme = () => {
            const isDark = document.documentElement.classList.contains('dark');
            setTheme(isDark ? 'vs-dark' : 'light');
        };
        updateTheme();
        const observer = new MutationObserver(updateTheme);
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
        return () => observer.disconnect();
    }, []);

    // Initialize Mermaid with improved configuration
    useEffect(() => {
        mermaid.initialize({
            startOnLoad: true,
            theme: 'base',
            themeVariables: {
                primaryColor: '#7c3aed', // Primary Violet
                primaryTextColor: '#1e293b', // Slate 800 for better contrast
                lineColor: '#a78bfa', // Violet 400
                mainBkg: '#ffffff',
                nodeBorder: '#8b5cf6', // Violet 500
                fontFamily: 'Inter, system-ui, sans-serif',
                fontSize: '14px',
            },
            securityLevel: 'loose',
            flowchart: {
                curve: 'linear',
                htmlLabels: true, // Enable HTML labels for better text rendering
                nodeSpacing: 50,
                rankSpacing: 50,
                padding: 15,
            }
        });
    }, []);

    // Generate Live Diagram when code changes (Static fallback)
    useEffect(() => {
        if (!decodeResult && codeText) {
            const generate = async () => {
                const svg = await logicMapService.generateDiagram(codeText, inputLanguage);
                setLiveMermaid(svg);
            };
            const timeout = setTimeout(generate, 800);
            return () => clearTimeout(timeout);
        }
    }, [codeText, decodeResult, inputLanguage]);

    // Fix for Java: Accumulate variables to ensure we have the latest state even if the step only provides diffs
    const accumulatedVariables = React.useMemo(() => {
        if (!inputLanguage) return null;
        const lang = inputLanguage.toLowerCase();
        // Enable for Java AND Javascript/Typescript
        if (!lang.includes('java') && !lang.includes('js') && !lang.includes('script') && !lang.includes('sharp') && !lang.includes('c#')) return null;

        const acc: Record<string, any> = {};
        for (let i = 0; i <= currentStepIndex; i++) {
            const s = steps[i];
            if (s && s.variables) {
                Object.assign(acc, s.variables);
            }
        }
        return acc;
    }, [steps, currentStepIndex, inputLanguage]);

    // State to track if graph is ready for highlighting
    const [isGraphReady, setIsGraphReady] = useState(false);
    const lastRenderedGraph = useRef<string>("");
    const hasInitialScrolled = useRef(false);

    // 1. RENDER GRAPH & SMART ZOOM (Only runs when graph definition changes)
    useEffect(() => {
        if (mermaidRef.current) {
            const renderFlowchart = async () => {
                try {
                    let graphDefinition = decodeResult?.flowchartMermaid || liveMermaid;

                    // Enforce Vertical Layout (Top-Down) as requested
                    if (graphDefinition) {
                        graphDefinition = graphDefinition
                            .replace(/flowchart\s+LR/gi, 'flowchart TD')
                            .replace(/graph\s+LR/gi, 'graph TD');
                    }

                    // Avoid re-rendering if identical
                    if (!graphDefinition || graphDefinition === lastRenderedGraph.current) {
                        if (graphDefinition) setIsGraphReady(true);
                        return;
                    }

                    mermaidRef.current!.innerHTML = '';
                    lastRenderedGraph.current = graphDefinition;

                    if (graphDefinition) {
                        const { svg } = await mermaid.render(`mermaid-${Date.now()}`, graphDefinition);
                        mermaidRef.current!.innerHTML = svg;

                        // --- SMART FIT-TO-WIDTH STRATEGY ---
                        // Measure after render
                        const containerWidth = mermaidRef.current.parentElement?.clientWidth || 0;
                        const chartWidth = mermaidRef.current.scrollWidth || 0;

                        // Edge Case 1: Zero Size Logic (Sanity Check)
                        if (containerWidth > 0 && chartWidth > 0) {
                            // Calculate Ratio (with 40px buffer for Edge Case 5: Scrollbar Loop)
                            let ratio = (containerWidth - 40) / chartWidth;

                            // Edge Case 2: Vanity Cap (Don't balloon tiny charts)
                            if (ratio > 1.0) ratio = 1.0;

                            // Edge Case 3: Readability Floor (Don't shrink to ants)
                            if (ratio < 0.5) ratio = 0.5;

                            // Apply
                            setZoomLevel(ratio);
                            defaultZoomRef.current = ratio;
                        } else {
                            // Fallback
                            setZoomLevel(1.0);
                            defaultZoomRef.current = 1.0;
                        }

                        setIsGraphReady(true);
                        // RESET SCROLL FLAG ON NEW GRAPH
                        hasInitialScrolled.current = false;
                    }
                } catch (e) {
                    console.error("Mermaid render error", e);
                }
            };
            renderFlowchart();
        }
    }, [decodeResult?.flowchartMermaid, liveMermaid]);

    // Helper: Apply Highlighting & Variables
    const highlightStep = useCallback(() => {
        if (!mermaidRef.current || !currentStep.blockId) return null;

        const baseId = currentStep.blockId;
        const nodes = mermaidRef.current.querySelectorAll(`g[id*="${baseId}_"].node, g[id*="${baseId}_"].cluster`);

        // Reset previous styles
        const allNodes = mermaidRef.current.querySelectorAll('g[id*="flowchart-L"].node, g[id*="flowchart-L"].cluster');
        allNodes.forEach(n => {
            n.querySelectorAll('rect, circle, polygon, path').forEach(s => s.removeAttribute('style'));
            n.querySelectorAll('text, tspan, .nodeLabel, span').forEach(t => {
                (t as HTMLElement).style.fontWeight = '';
            });
        });

        let firstNode: Element | null = null;
        nodes.forEach(node => {
            if (!node.id.startsWith('flowchart-L')) return;
            if (!firstNode) firstNode = node;

            // 1. HIGHLIGHTING
            const shapes = node.querySelectorAll('rect, circle, polygon, path');
            shapes.forEach(shape => {
                if (theme === 'vs-dark') {
                    shape.setAttribute('style', 'fill: #064e3b !important; stroke: #4ade80 !important; stroke-width: 3px !important;');
                } else {
                    shape.setAttribute('style', 'fill: #dcfce7 !important; stroke: #16a34a !important; stroke-width: 3px !important;');
                }
            });

            // 2. VARIABLE DISPLAY
            const isAccumulated = inputLanguage?.toLowerCase().includes('java') ||
                inputLanguage?.toLowerCase().includes('js') ||
                inputLanguage?.toLowerCase().includes('script') ||
                inputLanguage?.toLowerCase().includes('sharp') ||
                inputLanguage?.toLowerCase().includes('c#');

            const varsToUse = (isAccumulated && accumulatedVariables) ? accumulatedVariables : currentStep.variables;

            if (varsToUse && Object.keys(varsToUse).length > 0) {
                const foreignObj = node.querySelector('foreignObject');
                let labelDiv = foreignObj?.querySelector('div');

                if (!labelDiv) {
                    const svgText = node.querySelector('text');
                    if (svgText) labelDiv = svgText as any;
                }

                if (labelDiv) {
                    if (!labelDiv.getAttribute('data-original')) {
                        labelDiv.setAttribute('data-original', labelDiv.innerHTML);
                    }
                    let modifiedText = labelDiv.getAttribute('data-original') || '';
                    const annotations: string[] = [];

                    Object.entries(varsToUse).forEach(([varName, varData]: [string, any]) => {
                        const value = typeof varData === 'object' && varData.value !== undefined ? varData.value : String(varData);
                        const isUserInput = inputValues && varName in inputValues;
                        const plainText = labelDiv!.textContent || '';
                        const isAssignmentTarget = new RegExp(`${varName}\\s*=`).test(plainText);

                        if (isUserInput || isAssignmentTarget) {
                            annotations.push(`${varName} = ${value}`);
                        }

                        const regex = new RegExp(`\\b${varName}\\b(?!\\s*=)`, 'g');
                        if (regex.test(modifiedText)) {
                            modifiedText = modifiedText.replace(regex, `<tspan style="font-weight:900; color:${theme === 'vs-dark' ? '#4ade80' : '#16a34a'}">${value}</tspan>`);
                        }
                    });

                    labelDiv.innerHTML = modifiedText;
                    if (annotations.length > 0) {
                        // Check if annotation already exists to avoid dupes in re-runs
                        if (!labelDiv.querySelector('.annotation-div')) {
                            const annotationDiv = document.createElement('div');
                            annotationDiv.className = 'annotation-div'; // Marker class
                            annotationDiv.style.cssText = `
                                font-size: 11px;
                                color: ${theme === 'vs-dark' ? '#fbbf24' : '#b45309'};
                                font-weight: bold;
                                margin-top: 4px;
                                border-top: 1px dashed ${theme === 'vs-dark' ? '#fbbf24' : '#d97706'};
                                padding-top: 4px;
                            `;
                            annotationDiv.textContent = annotations.join(', ');
                            labelDiv.appendChild(annotationDiv);

                            const rect = node.querySelector('rect');
                            if (rect && foreignObj) {
                                const newHeight = labelDiv.scrollHeight + 16;
                                const currentHeight = parseFloat(rect.getAttribute('height') || '0');
                                if (newHeight > currentHeight) {
                                    rect.setAttribute('height', String(newHeight));
                                    foreignObj.setAttribute('height', String(newHeight));
                                }
                            }
                        }
                    }
                }
            }
        });

        return firstNode;
    }, [mermaidRef, currentStep, theme, inputLanguage, accumulatedVariables, inputValues]);

    // 2. RESIZE OBSERVER (Handles Initial Scroll when Graph Expands)
    // 2. RESIZE OBSERVER (Handles Initial Scroll & Highlight when Graph Expands)
    useEffect(() => {
        if (!mermaidRef.current) return;

        const observer = new ResizeObserver(() => {
            if (isGraphReady && !hasInitialScrolled.current && currentStep.blockId) {
                // Try to highlight (and find node)
                const firstNode = highlightStep();

                if (firstNode) {
                    firstNode.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
                    hasInitialScrolled.current = true;
                    // console.log("[ResizeObserver] Initial Scroll & Highlight Triggered");
                }
            }
        });

        observer.observe(mermaidRef.current);

        return () => observer.disconnect();
    }, [isGraphReady, currentStep.blockId, highlightStep]);

    // 3. HIGHLIGHT & UPDATE NODES (Runs on every step change)
    useEffect(() => {
        if (!mermaidRef.current || !isGraphReady) return;

        const firstNode = highlightStep();

        // 3. SCROLL INTO VIEW (For Navigation)
        if (firstNode && hasInitialScrolled.current) {
            // Only scroll if we have already done the initial "Center on Load"
            // This prevents fighting with the ResizeObserver, but ensures step navigation scrolls.
            setTimeout(() => firstNode?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' }), 50);
        }
    }, [currentStepIndex, currentStep, theme, isGraphReady, highlightStep]);

    // Auto-scroll Source Code to active line -> Replaced by Monaco Logic
    const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
    const decorationsCollectionRef = useRef<monaco.editor.IEditorDecorationsCollection | null>(null);

    // Sync Annotations (Active Line, Arrow, Inline Values)
    useEffect(() => {
        if (!editorRef.current || !decodeResult || !hasResults || !isEditorReady) return;

        const step = decodeResult.steps[currentStepIndex];
        if (!step || !step.line) return;

        const model = editorRef.current.getModel();
        if (!model) return;

        // 1. Validate Line Number (Prevent Crash)
        const lineCount = model.getLineCount();
        if (typeof step.line !== 'number' || step.line < 1 || step.line > lineCount) {
            console.warn(`[DecodeView] Skipped invalid line: ${step.line}`);
            // If it's an exception, we might want to highlight the last line or similar, 
            // but for safety, we clear decorations and return.
            if (decorationsCollectionRef.current) {
                decorationsCollectionRef.current.clear();
            }
            return;
        }

        // 2. Scroll to line
        editorRef.current.revealLineInCenter(step.line);

        // 3. Prepare Inline Values Text
        // Filter variables that actually appear in the line's code
        const lineContent = model.getLineContent(step.line);
        let inlineText = '';
        if (step.variables) {
            const relevantVars = Object.entries(step.variables)
                // @ts-ignore
                .filter(([k, v]) => v && new RegExp(`\\b${k}\\b`).test(lineContent))
                // @ts-ignore
                .map(([k, v]) => `${k}=${v?.value || '?'}`)
                .join(', ');
            if (relevantVars) inlineText = `    # ${relevantVars}`;
        }

        // 3. Create Decorations
        const newDecorations: monaco.editor.IModelDeltaDecoration[] = [
            {
                range: new monaco.Range(step.line, 1, step.line, 1),
                options: {
                    isWholeLine: true,
                    className: 'debug-active-line', // Blue background
                    glyphMarginClassName: 'debug-glyph-arrow', // Large Arrow
                }
            }
        ];

        // Add ghost text if vars exist
        if (inlineText) {
            newDecorations.push({
                range: new monaco.Range(step.line, 1000, step.line, 1000),
                options: {
                    after: {
                        content: inlineText,
                        inlineClassName: 'debug-inline-values'
                    }
                }
            });
        }

        // Apply
        if (decorationsCollectionRef.current) {
            decorationsCollectionRef.current.clear();
        }
        decorationsCollectionRef.current = editorRef.current.createDecorationsCollection(newDecorations);

    }, [currentStepIndex, decodeResult, hasResults, isEditorReady]);


    // Helper to format Tutor-style tags
    const formatExplanation = (str: string): string => {
        if (!str) return "";
        return str
            .replace(/<var>/g, '<span class="font-bold text-amber-600 dark:text-amber-400">')
            .replace(/<\/var>/g, '</span>')
            .replace(/<k>/g, '<span class="font-bold text-purple-600 dark:text-purple-400">')
            .replace(/<\/k>/g, '</span>')
            .replace(/<v>/g, '<span class="font-bold text-emerald-600 dark:text-emerald-400">')
            .replace(/<\/v>/g, '</span>')
            .replace(/<val>/g, '<span class="font-bold text-emerald-600 dark:text-emerald-400">')
            .replace(/<\/val>/g, '</span>')
            .replace(/<f>/g, '<span class="font-bold text-blue-600 dark:text-blue-400">')
            .replace(/<\/f>/g, '</span>');
    };

    const handleStepChange = (newIndex: number) => {
        console.log('[DecodeView] handleStepChange called with:', newIndex, 'steps.length:', steps.length);
        if (newIndex >= 0 && newIndex < steps.length) {
            console.log('[DecodeView] Calling updateData with currentStepIndex:', newIndex);
            updateData({ currentStepIndex: newIndex });
        } else {
            console.log('[DecodeView] newIndex out of bounds, not updating');
        }
    };

    return (
        <main className="flex-1 flex flex-col bg-transparent p-6 gap-6 overflow-hidden">
            {/* Header Area */}
            <div className="flex flex-col gap-1 mb-2 shrink-0">
                <div className="flex items-center gap-2">
                    <span className="p-1.5 glass-pane rounded-lg shadow-sm">
                        <span className="material-icons-round text-lg text-primary">data_object</span>
                    </span>
                    <h2 className="text-xl font-bold text-slate-900 dark:text-white text-glass-shadow">Decode Logic</h2>
                </div>
                <p className="text-xs text-slate-700 dark:text-slate-200 ml-[44px]">Step-by-step code execution analysis.</p>
            </div>


            {/* TOP ROW: Explanation, Current State, Output (Grid cols 3) */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 h-[25%] min-h-[180px] shrink-0">

                {/* 1. EXPLANATION (Top-Left) */}
                <div className="card-neon shadow-2xl flex flex-col overflow-hidden relative group">
                    <div className="px-5 py-3 border-b border-white/10 bg-white/30 dark:bg-black/20 backdrop-blur-md flex items-center gap-2">
                        <span className="material-icons-round text-primary text-sm">lightbulb</span>
                        <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider">EXPLANATION</span>
                    </div>
                    <div className="flex-1 p-6 overflow-scroll code-scroll-area flex items-center justify-center text-center bg-white/40 dark:bg-slate-900/20">
                        {hasResults ? (
                            <div className="text-left w-full h-full">
                                {/* Rich HTML Explanation Rendering */}
                                <div
                                    className="text-left w-full h-full text-sm text-slate-700 dark:text-slate-200 [&>ul]:list-disc [&>ul]:pl-5 [&>li]:mb-1"
                                    dangerouslySetInnerHTML={{ __html: formatExplanation(currentStep.explanation as string) }}
                                />
                            </div>
                        ) : (
                            <span className="text-slate-400 dark:text-slate-500 text-sm italic font-light">
                                Get step by step explanation of code.
                            </span>
                        )}
                    </div>
                </div>

                {/* 2. CURRENT STATE (Top-Middle) - Variable Cards */}
                <div className="card-neon shadow-2xl flex flex-col overflow-hidden relative">
                    <div className="px-5 py-3 border-b border-white/10 bg-white/30 dark:bg-black/20 backdrop-blur-md flex items-center gap-2">
                        <span className="material-icons-round text-primary text-sm">tune</span>
                        <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider">CURRENT STATE</span>
                    </div>

                    <VariableStateSection
                        steps={steps}
                        currentStepIndex={currentStepIndex}
                        hasResults={hasResults}
                    />
                </div>

                {/* 3. OUTPUT (Top-Right) - Final Console Output */}
                <div className="card-neon shadow-2xl flex flex-col overflow-hidden relative">
                    <div className="px-5 py-3 border-b border-white/10 bg-white/30 dark:bg-black/20 backdrop-blur-md flex items-center gap-2">
                        <span className="material-icons-round text-primary text-sm">terminal</span>
                        <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider">OUTPUT</span>
                    </div>

                    <OutputStateSection
                        steps={steps}
                        currentStepIndex={currentStepIndex}
                        hasResults={hasResults}
                    />
                </div>

            </div>


            {/* MIDDLE ROW: Source Code, Logic Map (Grid cols 2) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 flex-1 min-h-0">

                {/* 4. SOURCE CODE (Middle-Left) */}
                <div className="card-neon shadow-2xl flex flex-col overflow-hidden relative">
                    <div className="px-5 py-3 border-b border-white/10 bg-white/30 dark:bg-black/20 backdrop-blur-md flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <span className="material-icons-round text-primary text-sm">code</span>
                            <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider">SOURCE CODE</span>
                        </div>
                        <span className="text-[10px] font-mono text-primary/70">main.py</span>
                    </div>
                    <div className="flex-1 p-0 overflow-hidden relative bg-white/40 dark:bg-slate-900/20" ref={containerRef}>
                        {/* Editor Wrapper with Custom Scrollbars */}
                        <div className="absolute top-0 left-0 right-[16px] bottom-[16px]">
                            <Editor
                                height="100%"
                                width="100%"
                                language={(inputLanguage || 'python').toLowerCase()}
                                value={codeText}
                                theme={theme}
                                options={{
                                    readOnly: true,
                                    minimap: { enabled: false },
                                    scrollBeyondLastLine: false,
                                    fontSize: 13,
                                    fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
                                    renderLineHighlight: 'none', // We handle this manually
                                    glyphMargin: true, // For the arrow
                                    lineNumbers: 'on',
                                    folding: false,
                                    scrollbar: {
                                        vertical: 'hidden',
                                        horizontal: 'hidden',
                                        handleMouseWheel: true,
                                        alwaysConsumeMouseWheel: false
                                    },
                                    domReadOnly: true,
                                    contextmenu: false,
                                    overviewRulerBorder: false,
                                    hideCursorInOverviewRuler: true
                                }}
                                onMount={(editor) => {
                                    editorRef.current = editor;

                                    // Scrollbar Sync Logic
                                    const updateDims = () => {
                                        setScrollDims({
                                            scrollHeight: editor.getScrollHeight(),
                                            scrollWidth: editor.getScrollWidth(),
                                            containerHeight: editor.getLayoutInfo().height,
                                            containerWidth: editor.getLayoutInfo().width
                                        });
                                    };

                                    updateDims();
                                    editor.onDidScrollChange((e) => {
                                        if (!syncingRef.current) {
                                            syncingRef.current = true;
                                            if (vScrollRef.current) vScrollRef.current.scrollTop = e.scrollTop;
                                            if (hScrollRef.current) hScrollRef.current.scrollLeft = e.scrollLeft;
                                            if (e.scrollHeightChanged || e.scrollWidthChanged) updateDims();
                                            requestAnimationFrame(() => syncingRef.current = false);
                                        }
                                    });
                                    editor.onDidChangeModelContent(() => setTimeout(updateDims, 50));
                                    editor.onDidLayoutChange(updateDims);
                                    setIsEditorReady(true);
                                }}
                            />
                        </div>

                        {/* Native Vertical Scrollbar */}
                        <div
                            ref={vScrollRef}
                            className="code-editor-vscroll code-scroll-area absolute top-0 right-0 bottom-[16px] w-[16px] overflow-y-scroll overflow-x-hidden"
                            onScroll={() => {
                                if (!syncingRef.current && editorRef.current && vScrollRef.current) {
                                    syncingRef.current = true;
                                    editorRef.current.setScrollTop(vScrollRef.current.scrollTop);
                                    requestAnimationFrame(() => syncingRef.current = false);
                                }
                            }}
                        >
                            <div style={{ height: scrollDims.scrollHeight, width: 1 }} />
                        </div>

                        {/* Native Horizontal Scrollbar */}
                        <div
                            ref={hScrollRef}
                            className="code-editor-hscroll code-scroll-area absolute left-0 bottom-0 right-[16px] h-[16px] overflow-x-scroll overflow-y-hidden"
                            onScroll={() => {
                                if (!syncingRef.current && editorRef.current && hScrollRef.current) {
                                    syncingRef.current = true;
                                    editorRef.current.setScrollLeft(hScrollRef.current.scrollLeft);
                                    requestAnimationFrame(() => syncingRef.current = false);
                                }
                            }}
                        >
                            <div style={{ width: scrollDims.scrollWidth, height: 1 }} />
                        </div>

                        {/* Corner Filler */}
                        <div className="absolute right-0 bottom-0 w-[16px] h-[16px] bg-slate-100 dark:bg-slate-800" />
                    </div>
                </div>

                {/* 5. LOGIC MAP (Middle-Right) */}
                {/* 5. LOGIC MAP (Middle-Right) */}
                <div className="card-neon shadow-2xl flex flex-col overflow-hidden relative">
                    <div className="px-5 py-3 border-b border-white/10 bg-white/30 dark:bg-black/20 backdrop-blur-md flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <span className="material-icons-round text-primary text-sm">hub</span>
                            <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider">LOGIC MAP</span>
                        </div>
                        {/* Zoom Controls */}
                        {/* Zoom Controls */}
                        <div className="flex items-center bg-slate-100/50 dark:bg-slate-800/50 rounded-lg p-0.5 border border-slate-200/50 dark:border-slate-700/50 backdrop-blur-sm">
                            <button
                                onClick={() => setZoomLevel(prev => Math.min(prev + 0.1, 2.0))}
                                className="p-1.5 hover:bg-white dark:hover:bg-slate-700 rounded-md text-slate-500 hover:text-primary dark:text-slate-400 dark:hover:text-primary-light transition-all shadow-none hover:shadow-sm"
                                title="Zoom In"
                            >
                                <span className="material-icons-round text-sm">zoom_in</span>
                            </button>
                            <div className="w-px h-3 bg-slate-200 dark:bg-slate-700 mx-0.5"></div>
                            <button
                                onClick={() => setZoomLevel(prev => Math.max(prev - 0.1, 0.5))}
                                className="p-1.5 hover:bg-white dark:hover:bg-slate-700 rounded-md text-slate-500 hover:text-primary dark:text-slate-400 dark:hover:text-primary-light transition-all shadow-none hover:shadow-sm"
                                title="Zoom Out"
                            >
                                <span className="material-icons-round text-sm">zoom_out</span>
                            </button>
                            <div className="w-px h-3 bg-slate-200 dark:bg-slate-700 mx-0.5"></div>
                            <button
                                onClick={() => setZoomLevel(defaultZoomRef.current)}
                                className="p-1.5 hover:bg-white dark:hover:bg-slate-700 rounded-md text-slate-500 hover:text-primary dark:text-slate-400 dark:hover:text-primary-light transition-all shadow-none hover:shadow-sm"
                                title="Reset Zoom"
                            >
                                <span className="material-icons-round text-sm">restart_alt</span>
                            </button>
                        </div>
                    </div>
                    <div className="flex-1 overflow-scroll code-scroll-area bg-white/40 dark:bg-slate-900/20 relative">
                        <div
                            style={{
                                transform: `scale(${zoomLevel})`,
                                transformOrigin: 'top left',
                                transition: 'transform 0.1s ease-out'
                            }}
                            className="w-full h-full p-4"
                        >
                            <div ref={mermaidRef} className="min-w-fit min-h-fit"></div>
                        </div>
                    </div>
                    {!hasResults && !liveMermaid && (
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                            <span className="text-slate-400 dark:text-slate-500 text-sm italic font-light">
                                Logic map will appear here.
                            </span>
                        </div>
                    )}
                </div>

            </div>


            {/* BOTTOM ROW: Timeline / Controls (Step Navigator) */}
            <div className="card-neon shadow-xl p-4 flex items-center gap-4 relative overflow-hidden shrink-0">

                {/* Info Text */}
                <div className="flex flex-col min-w-[140px]">
                    <div className="flex items-baseline gap-1">
                        <span className="text-lg font-bold text-blue-600 dark:text-blue-400">
                            Step {hasResults ? currentStepIndex + 1 : 0}
                        </span>
                        <span className="text-lg font-medium text-slate-400 dark:text-slate-500">
                            / {steps.length}
                        </span>
                    </div>
                    <span className="text-[10px] text-slate-400 uppercase tracking-widest font-semibold">
                        LINE {hasResults ? currentStep.line : '--'}
                    </span>
                </div>

                {/* Slider (Red Indicator) - Using visible styled range input */}
                <div className="flex-1 relative">
                    <input
                        type="range"
                        min="0"
                        max={steps.length > 0 ? steps.length - 1 : 0}
                        step={1}
                        value={hasResults ? currentStepIndex : 0}
                        onChange={(e) => {
                            console.log('[Slider onChange] Raw value:', e.target.value, 'valueAsNumber:', e.target.valueAsNumber);
                            handleStepChange(e.target.valueAsNumber);
                        }}
                        disabled={!hasResults}
                        className="w-full h-2 rounded-full appearance-none cursor-pointer disabled:cursor-not-allowed
                            bg-slate-200 dark:bg-slate-700
                            [&::-webkit-slider-thumb]:appearance-none
                            [&::-webkit-slider-thumb]:w-5
                            [&::-webkit-slider-thumb]:h-5
                            [&::-webkit-slider-thumb]:rounded-full
                            [&::-webkit-slider-thumb]:bg-white
                            [&::-webkit-slider-thumb]:border-2
                            [&::-webkit-slider-thumb]:border-red-500
                            [&::-webkit-slider-thumb]:shadow-lg
                            [&::-webkit-slider-thumb]:cursor-pointer
                            [&::-moz-range-thumb]:w-5
                            [&::-moz-range-thumb]:h-5
                            [&::-moz-range-thumb]:rounded-full
                            [&::-moz-range-thumb]:bg-white
                            [&::-moz-range-thumb]:border-2
                            [&::-moz-range-thumb]:border-red-500
                            [&::-moz-range-thumb]:shadow-lg
                            [&::-moz-range-thumb]:cursor-pointer
                            [&::-webkit-slider-runnable-track]:rounded-full
                            [&::-moz-range-track]:rounded-full"
                        style={{
                            background: hasResults
                                ? `linear-gradient(to right, #ef4444 0%, #ef4444 ${(currentStepIndex / Math.max(steps.length - 1, 1)) * 100}%, #e2e8f0 ${(currentStepIndex / Math.max(steps.length - 1, 1)) * 100}%, #e2e8f0 100%)`
                                : '#e2e8f0'
                        }}
                    />
                </div>

                {/* Buttons (Cyan & Yellow) */}
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => handleStepChange(currentStepIndex - 1)}
                        disabled={!hasResults || currentStepIndex === 0}
                        // PREV: CYAN (bg-cyan-400) - Dark text for contrast
                        className="px-6 py-2 rounded-lg bg-cyan-400 hover:bg-cyan-300 text-cyan-950 text-xs font-bold disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-[0_0_15px_rgba(34,211,238,0.4)] border border-cyan-300"
                    >
                        ← Prev
                    </button>
                    <button
                        onClick={() => handleStepChange(currentStepIndex + 1)}
                        disabled={!hasResults || currentStepIndex === steps.length - 1}
                        // NEXT: YELLOW (bg-amber-400) - Dark text
                        className="px-6 py-2 rounded-lg bg-amber-400 hover:bg-amber-300 text-amber-950 text-xs font-bold disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-[0_0_15px_rgba(251,191,36,0.4)] border border-amber-300"
                    >
                        Next →
                    </button>
                </div>
            </div>

        </main>
    );
};

export default DecodeView;