import React from 'react';

interface VariableCardProps {
    name: string;
    value: string;
    type: string;
    history?: string[];
}

export const VariableCard: React.FC<VariableCardProps> = ({ name, value, type, history }) => {
    // Determine styles based on type
    const getStyles = () => {
        const lowerType = (type || '').toLowerCase();

        // Numbers (Orange/Amber)
        if (['int', 'float', 'number', 'decimal', 'double'].includes(lowerType)) {
            return {
                border: 'border-l-amber-500',
                bg: 'bg-amber-50 dark:bg-amber-900/20',
                text: 'text-amber-700 dark:text-amber-300',
                label: 'text-amber-600/70 dark:text-amber-400/70',
                glow: 'shadow-[0_0_15px_rgba(245,158,11,0.15)]' // Amber-500 glow
            };
        }

        // Strings (Green/Emerald)
        if (['str', 'string', 'char'].includes(lowerType)) {
            return {
                border: 'border-l-emerald-500',
                bg: 'bg-emerald-50 dark:bg-emerald-900/20',
                text: 'text-emerald-700 dark:text-emerald-300',
                label: 'text-emerald-600/70 dark:text-emerald-400/70',
                glow: 'shadow-[0_0_15px_rgba(16,185,129,0.15)]' // Emerald-500 glow
            };
        }

        // Booleans (Pink/Fuchsia)
        if (['bool', 'boolean'].includes(lowerType)) {
            return {
                border: 'border-l-fuchsia-500',
                bg: 'bg-fuchsia-50 dark:bg-fuchsia-900/20',
                text: 'text-fuchsia-700 dark:text-fuchsia-300',
                label: 'text-fuchsia-600/70 dark:text-fuchsia-400/70',
                glow: 'shadow-[0_0_15px_rgba(217,70,239,0.15)]' // Fuchsia-500 glow
            };
        }

        // Collections (Cyan)
        if (['list', 'dict', 'set', 'tuple', 'array', 'object', 'map'].includes(lowerType)) {
            return {
                border: 'border-l-cyan-500',
                bg: 'bg-cyan-50 dark:bg-cyan-900/20',
                text: 'text-cyan-700 dark:text-cyan-300',
                label: 'text-cyan-600/70 dark:text-cyan-400/70',
                glow: 'shadow-[0_0_15px_rgba(6,182,212,0.15)]' // Cyan-500 glow
            };
        }

        // Default (Violet)
        return {
            border: 'border-l-violet-500',
            bg: 'bg-violet-50 dark:bg-violet-900/20',
            text: 'text-violet-700 dark:text-violet-300',
            label: 'text-violet-600/70 dark:text-violet-400/70',
            glow: 'shadow-[0_0_15px_rgba(139,92,246,0.15)]' // Violet-500 glow
        };
    };

    const styles = getStyles();

    return (
        <div className={`
            relative flex flex-col min-w-[140px] max-w-[220px] 
            rounded-r-lg rounded-l-sm border-l-[4px] 
            ${styles.border} ${styles.bg} ${styles.glow}
            p-3 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg
        `}>
            {/* Header: Name and Type */}
            <div className="flex items-center justify-between gap-2 mb-2 border-b border-black/5 dark:border-white/5 pb-1">
                <span className="font-bold text-xs text-slate-700 dark:text-slate-200 truncate" title={name}>
                    {name}
                </span>
                <span className={`text-[9px] font-mono uppercase tracking-wider ${styles.label}`}>
                    {type}
                </span>
            </div>

            {/* Value Area */}
            {/* Value Area */}
            <div className={`
                text-sm font-mono font-bold break-all mb-1
                ${styles.text}
            `}>
                {value}
            </div>

            {/* History Section (If present) */}
            {history && Array.isArray(history) && history.length > 0 && (
                <div className="mt-2 pt-2 border-t border-black/5 dark:border-white/5 flex flex-col gap-1 overflow-hidden">
                    <span className="text-[9px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider flex items-center gap-1">
                        History
                        <span className="bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400 text-[8px] px-1 rounded-full">{history.length}</span>
                    </span>
                    <div className="flex gap-1 overflow-x-auto pb-1 code-scroll-area">
                        {history.map((val, idx) => (
                            <div key={idx} className={`text-[9px] font-mono px-1.5 py-0.5 rounded whitespace-nowrap bg-white/60 dark:bg-black/20 ${styles.text} opacity-80`}>
                                {String(val)}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};
