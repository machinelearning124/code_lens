import React, { useRef, useEffect, useMemo } from 'react';

export const OutputStateSection: React.FC<{ steps: any[], currentStepIndex: number, hasResults: boolean }> = ({ steps, currentStepIndex, hasResults }) => {
    const scrollRef = useRef<HTMLDivElement>(null);

    // 1. Calculate Output State (DIRECT READ + DEDUPLICATION)
    const outputLines = useMemo(() => {
        if (!hasResults) return [];

        // Use currentStepIndex directly (Strict Time Travel)
        const lookAheadIndex = currentStepIndex;
        const step = steps[lookAheadIndex];

        let rawOutput = '';

        if (step && step.output) {
            rawOutput = step.output;
        } else {
            // Fallback: If current step has no output, find the latest valid one.
            for (let i = lookAheadIndex; i >= 0; i--) {
                if (steps[i] && steps[i].output) {
                    rawOutput = steps[i].output;
                    break;
                }
            }
        }

        if (!rawOutput) return [];

        return rawOutput
            .split('\n')
            .map(line => line.trimEnd()) // Clean whitespace
            .filter(line => line.length > 0) // Remove empty lines to prevent gap-based duplication
            .filter(line => line.length > 0); // Remove empty lines to prevent gaps

    }, [steps, currentStepIndex, hasResults]);

    // 2. Auto-Scroll to bottom when output changes
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [outputLines]);

    return (
        <div className="flex-1 flex flex-col h-full min-w-0 p-0 overflow-hidden relative bg-white/40 dark:bg-slate-900/20">
            {/* Always render scroll container for consistent scrollbar visibility */}
            <div
                ref={scrollRef}
                className="flex-1 w-full p-6 overflow-scroll code-scroll-area flex flex-col items-start gap-1"
            >
                {hasResults ? (
                    outputLines.length > 0 ? (
                        outputLines.map((line, i) => (
                            <div key={i} className="font-mono text-xs text-slate-800 dark:text-slate-200 whitespace-pre-wrap text-left w-full break-words">
                                <span className="opacity-50 select-none mr-2">{'>'}</span>{line}
                            </div>
                        ))
                    ) : (
                        <span className="text-slate-400 dark:text-slate-500 text-sm italic font-light opacity-60">
                            No output yet...
                        </span>
                    )
                ) : (
                    <div className="w-full h-full flex items-center justify-center text-center">
                        <span className="text-slate-400 dark:text-slate-500 text-sm italic font-light opacity-80">
                            Code output will appear here.
                        </span>
                    </div>
                )}
            </div>
        </div>
    );
};
