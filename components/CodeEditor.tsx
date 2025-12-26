import React, { useState, useEffect, useRef, useCallback } from 'react';
import Editor, { OnMount } from "@monaco-editor/react";
import * as monaco from 'monaco-editor';
import { treeSitterService, SyntaxError } from '../services/treeSitterService';

interface CodeEditorProps {
    value: string;
    onChange: (value: string) => void;
    language: string;
    className?: string;
    onSyntaxChange?: (isValid: boolean) => void;
}

const CodeEditor: React.FC<CodeEditorProps> = ({ value, onChange, language, className = "", onSyntaxChange }) => {
    const [syntaxError, setSyntaxError] = useState<SyntaxError | null>(null);
    const [theme, setTheme] = useState<'light' | 'vs-dark'>('light');

    // Refs
    const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const vScrollRef = useRef<HTMLDivElement>(null);
    const hScrollRef = useRef<HTMLDivElement>(null);
    const syncingRef = useRef(false);

    // Scroll dimensions
    const [scrollDims, setScrollDims] = useState({
        scrollHeight: 0,
        scrollWidth: 0,
        containerHeight: 0,
        containerWidth: 0
    });

    // Theme sync
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

    // Syntax checking
    const checkSyntax = useCallback(async (code: string) => {
        const normalizedLang = language.toLowerCase();
        console.log("[CodeEditor] checkSyntax called, language:", normalizedLang, "code length:", code.length);

        if (!['python', 'java', 'javascript', 'js', 'csharp', 'c#', 'sql', 'snowflake', 'spark'].some(l => normalizedLang.includes(l))) {
            console.log("[CodeEditor] Language not supported for syntax checking:", normalizedLang);
            setSyntaxError(null);
            if (onSyntaxChange) onSyntaxChange(true);
            return;
        }
        try {
            console.log("[CodeEditor] Calling treeSitterService.validate...");
            const error = await treeSitterService.validate(code, normalizedLang);

            // Special handling for Spark SQL "CREATE WIDGET" which is standard in Databricks but invalid ANSI SQL
            if (error && normalizedLang.includes('spark')) {
                const lines = code.split('\n');
                const errorLineIndex = error.line - 1; // error.line is usually 1-indexed
                if (lines[errorLineIndex] && /CREATE\s+WIDGET/i.test(lines[errorLineIndex])) {
                    console.log("[CodeEditor] Ignoring syntax error for valid Spark Widget syntax");
                    setSyntaxError(null);
                    if (onSyntaxChange) onSyntaxChange(true);
                    return;
                }
            }

            console.log("[CodeEditor] Validation result:", error);
            setSyntaxError(error);
            if (onSyntaxChange) onSyntaxChange(error === null);
        } catch (e) {
            console.error("[CodeEditor] checkSyntax error:", e);
            if (onSyntaxChange) onSyntaxChange(true);
        }
    }, [language, onSyntaxChange]);

    const handleEditorChange = (newValue: string | undefined) => {
        const code = newValue || "";
        onChange(code);
        checkSyntax(code);
    };

    useEffect(() => {
        if (value) checkSyntax(value);
    }, [language, value, checkSyntax]);

    // Update scroll dimensions
    const updateScrollDims = useCallback(() => {
        if (!editorRef.current) return;
        const editor = editorRef.current;
        setScrollDims({
            scrollHeight: editor.getScrollHeight(),
            scrollWidth: editor.getScrollWidth(),
            containerHeight: editor.getLayoutInfo().height,
            containerWidth: editor.getLayoutInfo().width
        });
    }, []);

    // Sync native scrollbar -> Monaco
    const handleNativeVScroll = useCallback(() => {
        if (syncingRef.current || !editorRef.current || !vScrollRef.current) return;
        syncingRef.current = true;
        editorRef.current.setScrollTop(vScrollRef.current.scrollTop);
        requestAnimationFrame(() => { syncingRef.current = false; });
    }, []);

    const handleNativeHScroll = useCallback(() => {
        if (syncingRef.current || !editorRef.current || !hScrollRef.current) return;
        syncingRef.current = true;
        editorRef.current.setScrollLeft(hScrollRef.current.scrollLeft);
        requestAnimationFrame(() => { syncingRef.current = false; });
    }, []);

    // Mount handler
    const handleEditorMount: OnMount = (editor) => {
        editorRef.current = editor;
        checkSyntax(value);
        updateScrollDims();

        // Sync Monaco -> native scrollbars
        editor.onDidScrollChange((e) => {
            if (syncingRef.current) return;
            syncingRef.current = true;
            if (vScrollRef.current) vScrollRef.current.scrollTop = e.scrollTop;
            if (hScrollRef.current) hScrollRef.current.scrollLeft = e.scrollLeft;
            if (e.scrollHeightChanged || e.scrollWidthChanged) {
                updateScrollDims();
            }
            requestAnimationFrame(() => { syncingRef.current = false; });
        });

        // Update dims on content change
        editor.onDidChangeModelContent(() => {
            setTimeout(updateScrollDims, 50);
        });

        // Update dims on layout change
        editor.onDidLayoutChange(updateScrollDims);
    };

    // Scrollbar width constant
    const SCROLLBAR_SIZE = 16;

    return (
        <div
            ref={containerRef}
            className={`code-editor-wrapper relative w-full h-full flex flex-col border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-[#1e1e1e] overflow-hidden ${className}`}
        >
            {/* Monaco Container (Flex-1 to take available space) */}
            <div className="relative flex-1 min-h-0">
                {/* Monaco Editor - Hidden scrollbars, full area minus scrollbar space */}
                <div
                    className="absolute"
                    style={{
                        top: 0,
                        left: 0,
                        right: SCROLLBAR_SIZE,
                        bottom: SCROLLBAR_SIZE
                    }}
                >
                    <Editor
                        height="100%"
                        width="100%"
                        language={language.toLowerCase()}
                        value={value}
                        theme={theme}
                        onMount={handleEditorMount}
                        onChange={handleEditorChange}
                        loading={
                            <div className="flex items-center justify-center h-full text-slate-400">Loading Editor...</div>
                        }
                        options={{
                            minimap: { enabled: false },
                            fontSize: 14,
                            fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
                            scrollBeyondLastLine: false,
                            automaticLayout: true,
                            tabSize: 4,
                            wordWrap: 'off',
                            padding: { top: 16, bottom: 16 },
                            renderLineHighlight: 'none',
                            contextmenu: false,
                            scrollbar: {
                                vertical: 'hidden',
                                horizontal: 'hidden',
                                handleMouseWheel: true,
                                alwaysConsumeMouseWheel: false
                            },
                            overviewRulerBorder: false,
                            hideCursorInOverviewRuler: true,
                        }}
                    />
                </div>

                {/* Native Vertical Scrollbar - Uses global webkit styling with arrows */}
                <div
                    ref={vScrollRef}
                    onScroll={handleNativeVScroll}
                    className="code-editor-vscroll code-scroll-area absolute overflow-y-scroll overflow-x-hidden"
                    style={{
                        top: 0,
                        right: 0,
                        bottom: SCROLLBAR_SIZE,
                        width: SCROLLBAR_SIZE,
                    }}
                >
                    <div style={{ height: scrollDims.scrollHeight, width: 1 }} />
                </div>

                {/* Native Horizontal Scrollbar - Uses global webkit styling with arrows */}
                <div
                    ref={hScrollRef}
                    onScroll={handleNativeHScroll}
                    className="code-editor-hscroll code-scroll-area absolute overflow-x-scroll overflow-y-hidden"
                    style={{
                        left: 0,
                        bottom: 0,
                        right: SCROLLBAR_SIZE,
                        height: SCROLLBAR_SIZE,
                    }}
                >
                    <div style={{ width: scrollDims.scrollWidth, height: 1 }} />
                </div>

                {/* Corner Filler - Matches scrollbar track color */}
                <div
                    className="absolute bg-slate-300 dark:bg-slate-600"
                    style={{
                        right: 0,
                        bottom: 0,
                        width: SCROLLBAR_SIZE,
                        height: SCROLLBAR_SIZE,
                    }}
                />
            </div>

            {/* Syntax Error Footer (Dedicated Space) */}
            {syntaxError && (
                <div className="flex-shrink-0 bg-red-50/95 dark:bg-red-900/40 border-t border-red-200 dark:border-red-800 p-2 flex items-center gap-3 transition-all animate-in slide-in-from-bottom-2 fade-in duration-200">
                    <span className="material-icons-round text-red-500 text-lg">error_outline</span>
                    <div className="flex flex-row items-center gap-2 min-w-0 flex-1">
                        <span className="text-red-700 dark:text-red-300 font-bold text-xs uppercase tracking-wide flex-shrink-0">
                            Syntax Error (Line {syntaxError.line}):
                        </span>
                        <span className="text-red-600 dark:text-red-200 text-xs font-mono truncate" title={syntaxError.message}>
                            {syntaxError.message}
                        </span>
                    </div>
                </div>
            )}
        </div>
    );
};

export default CodeEditor;
