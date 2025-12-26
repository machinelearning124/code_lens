import React, { useRef, useEffect } from 'react';
import { VariableCard } from './VariableCard';

// Sub-component for strict variable state management & auto-scroll
export const VariableStateSection: React.FC<{ steps: any[], currentStepIndex: number, hasResults: boolean }> = ({ steps, currentStepIndex, hasResults }) => {
    const cardsRef = useRef<Map<string, HTMLDivElement>>(new Map());

    // Check for Loop Stack (Optimization for Loop Summarization)
    const currentStep = steps[currentStepIndex];
    const loopStack = currentStep?.loop_stack;

    // 1. Calculate State (Memoized for Persistence)
    const { visibleVars, activeKey } = React.useMemo(() => {
        const accumulatedVars: Record<string, { value: string; type: string; history?: string[] }> = {};

        // Accumulate up to currentStepIndex (Strict Time Travel)
        const lookAheadIndex = currentStepIndex;
        let lastChangedKey = null;

        for (let i = 0; i <= lookAheadIndex; i++) {
            const s = steps[i];
            if (s && s.variables) {
                Object.entries(s.variables).forEach(([key, val]) => {
                    // @ts-ignore
                    accumulatedVars[key] = val;
                    if (i === lookAheadIndex) lastChangedKey = key; // Track change in latest step
                });
            }
        }

        // Merge Loop Stack Variables (if present in current step)
        const currentStep = steps[currentStepIndex];
        if (currentStep && currentStep.loop_stack && Array.isArray(currentStep.loop_stack)) {
            currentStep.loop_stack.forEach((frame: any) => {
                if (frame.variables) {
                    // Handle both array (legacy/schema) and record (frontend type) formats
                    if (Array.isArray(frame.variables)) {
                        frame.variables.forEach((v: any) => {
                            if (v.name) accumulatedVars[v.name] = v;
                        });
                    } else {
                        Object.entries(frame.variables).forEach(([k, v]: any) => {
                            accumulatedVars[k] = v;
                            lastChangedKey = k; // Loop vars are likely active
                        });
                    }
                }
            });
        }

        // Filter
        const filtered = Object.entries(accumulatedVars).filter(([_, v]) => {
            const badTypes = ['function', 'module', 'class', 'method', 'type', 'builtin_function_or_method'];
            if (!v) return false;

            const t = v.type ? v.type.toLowerCase() : '';
            const val = v.value ? v.value.toLowerCase() : '';
            if (badTypes.some(bt => t.includes(bt))) return false;

            if (val === 'function') return false;
            if (val.startsWith('<function')) return false;
            if (val.startsWith('<class')) return false;
            if (val.includes('bound method')) return false;

            return true;
        });

        return { visibleVars: filtered, activeKey: lastChangedKey };
    }, [steps, currentStepIndex]);

    // 2. Auto-Scroll Effect
    useEffect(() => {
        if (!loopStack && activeKey && cardsRef.current.has(activeKey)) {
            const el = cardsRef.current.get(activeKey);
            el?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        }
    }, [activeKey, currentStepIndex, loopStack]);

    return (
        <div className="flex-1 flex flex-col h-full min-h-0 min-w-0 p-0 bg-white/40 dark:bg-slate-900/20 relative">
            {/* Always render scroll container for consistent scrollbar visibility */}
            <div className="flex-1 flex flex-row items-start overflow-scroll gap-4 w-full min-h-0 p-6 code-scroll-area">
                {hasResults ? (
                    visibleVars.length > 0 ? (
                        visibleVars.map(([k, v]) => (
                            <div
                                key={k}
                                className="shrink-0"
                                ref={(el) => {
                                    if (el) cardsRef.current.set(k, el);
                                    else cardsRef.current.delete(k);
                                }}
                            >
                                <VariableCard name={k} value={v.value} type={v.type} history={v.history} />
                            </div>
                        ))
                    ) : (
                        <div className="w-full flex items-center justify-center">
                            <span className="text-slate-400 dark:text-slate-500 text-sm italic font-light opacity-60">
                                No variables active
                            </span>
                        </div>
                    )
                ) : (
                    <div className="w-full h-full flex items-center justify-center text-center">
                        <span className="text-slate-400 dark:text-slate-500 text-sm italic font-light">
                            Variable state will appear here.
                        </span>
                    </div>
                )}
            </div>
        </div>
    );
};
