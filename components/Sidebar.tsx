import React, { useState } from 'react';
import { TabId, SidebarProps } from '../types';

const Sidebar: React.FC<SidebarProps> = ({
    apiKey,
    setApiKey,
    activeTab,
    setActiveTab,
    onReset,
    model,
    setModel
}) => {
    const [isNavHovering, setIsNavHovering] = useState(false);
    const [isConfigOpen, setIsConfigOpen] = useState(true);

    return (
        <div className="flex h-full shadow-xl z-50">

            {/* Column 1: Configuration Panel (Collapsible) */}
            <div
                className={`
            flex flex-col glass-pane border-r-0
            transition-all duration-300 ease-in-out overflow-hidden
            ${isConfigOpen ? 'w-64 opacity-100' : 'w-0 opacity-0 border-none'}
        `}
            >
                <div className="p-4 flex items-center justify-between h-16 border-b border-slate-200 dark:border-slate-800 whitespace-nowrap">
                    <span className="font-bold text-xs uppercase text-slate-600 dark:text-slate-300 tracking-wider">Configuration</span>
                    <button
                        onClick={() => setIsConfigOpen(false)}
                        className="text-slate-400 hover:text-primary p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
                        title="Hide Configuration"
                    >
                        <span className="material-icons-round">keyboard_double_arrow_left</span>
                    </button>
                </div>

                <div className="p-4 space-y-6 flex-1 overflow-y-auto">
                    <div className="space-y-2">
                        <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">API KEY</label>
                        <div className="relative">
                            <input
                                type="password"
                                value={apiKey}
                                onChange={(e) => setApiKey(e.target.value)}
                                className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg py-2 pl-3 pr-8 text-sm text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-all hover:border-primary/50"
                                placeholder="Enter API Key"
                            />
                            <div className="absolute inset-y-0 right-0 flex items-center px-2 pointer-events-none text-slate-500">
                                <span className="material-icons-round text-sm">vpn_key</span>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Model Name</label>
                        <div className="relative">
                            <select
                                value={model}
                                onChange={(e) => setModel(e.target.value)}
                                className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg py-2 pl-3 pr-8 text-sm text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-primary focus:border-primary outline-none appearance-none cursor-pointer transition-all hover:border-primary/50"
                            >
                                <option value="gemini-pro-latest">gemini-pro-latest</option>
                            </select>
                            <div className="absolute inset-y-0 right-0 flex items-center px-2 pointer-events-none text-slate-500">
                                <span className="material-icons-round text-sm">expand_more</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Column 2: Navigation & Actions (Hover Expandable) */}
            <aside
                className={`
            flex flex-col glass-pane border-r-0
            transition-all duration-300 ease-in-out
            ${isNavHovering ? 'w-60' : 'w-[72px]'}
        `}
                onMouseEnter={() => setIsNavHovering(true)}
                onMouseLeave={() => setIsNavHovering(false)}
            >
                {/* Header / Config Toggle */}
                <div className="h-16 flex items-center px-0 border-b border-border-light dark:border-border-dark overflow-hidden whitespace-nowrap relative">
                    {/* If config is closed, this button appears to open it. It replaces the logo icon. */}
                    {!isConfigOpen ? (
                        <button
                            onClick={() => setIsConfigOpen(true)}
                            className="w-[72px] h-16 flex items-center justify-center text-slate-400 hover:text-primary transition-colors absolute left-0 top-0 z-20"
                            title="Open Configuration"
                        >
                            <span className="material-icons-round text-2xl">tune</span>
                        </button>
                    ) : (
                        <div className="w-[72px] h-16 flex items-center justify-center absolute left-0 top-0 z-20 pointer-events-none">
                            <span className="material-icons-round text-3xl bg-clip-text text-transparent bg-gradient-to-r from-primary to-accent-violet">code</span>
                        </div>
                    )}

                    {/* App Title (Only visible on hover) */}
                    <div className={`pl-[72px] transition-opacity duration-200 ${isNavHovering ? 'opacity-100' : 'opacity-0'}`}>
                        <span className="font-bold text-lg tracking-tight">Code Lens</span>
                    </div>
                </div>

                {/* Tabs */}
                <nav className="flex-1 flex flex-col py-4 space-y-2 overflow-y-auto overflow-x-hidden">
                    {[
                        { id: TabId.Summarize, label: 'Code Overview', icon: 'summarize' },
                        { id: TabId.Decode, label: 'Decode Logic', icon: 'code' },
                        { id: TabId.Translate, label: 'Translate', icon: 'translate' },
                        { id: TabId.Optimize, label: 'Optimize', icon: 'rocket_launch' },
                    ].map((item) => {
                        const isActive = activeTab === item.id;
                        return (
                            <button
                                key={item.id}
                                onClick={() => setActiveTab(item.id)}
                                className={`group flex items-center h-12 w-[calc(100%-16px)] mx-2 my-1 rounded-xl transition-all duration-200 relative
                            ${isActive
                                        ? 'bg-primary text-white shadow-[0_0_15px_rgba(124,58,237,0.5)]'
                                        : 'text-slate-600 dark:text-slate-400 hover:bg-white/50 dark:hover:bg-white/10'
                                    }
                        `}
                            >
                                {/* Icon Container - Fixed Width */}
                                <div className="min-w-[68px] flex items-center justify-center">
                                    <span className={`material-icons-round text-2xl transition-all duration-200 ${isActive ? 'text-white' : 'text-slate-400 group-hover:text-primary'}`}>
                                        {item.icon}
                                    </span>
                                </div>

                                {/* Label */}
                                <span className={`font-medium whitespace-nowrap transition-opacity duration-200 ${isNavHovering ? 'opacity-100' : 'opacity-0 w-0 overflow-hidden'}`}>
                                    {item.label}
                                </span>
                            </button>
                        );
                    })}
                </nav>

                {/* Reset Button */}
                <div className="p-4 border-t border-border-light dark:border-border-dark overflow-hidden">
                    <button
                        onClick={() => {
                            if (window.confirm('Are you sure?')) {
                                onReset();
                            }
                        }}
                        className={`
                    w-full h-10 flex items-center justify-center rounded-lg transition-all
                    border border-red-200 dark:border-red-800/50 
                    text-red-600 dark:text-red-400 
                    bg-gradient-to-br from-red-50 to-red-100 dark:from-red-900/20 dark:to-red-800/20 
                    hover:from-red-100 hover:to-red-200 dark:hover:from-red-900/30 dark:hover:to-red-800/30
                    hover:shadow-md hover:shadow-red-200/50 dark:hover:shadow-red-900/30
                `}
                        title="Reset All Tabs"
                    >
                        <span className="material-icons-round text-xl">restart_alt</span>
                        <span className={`ml-2 font-medium whitespace-nowrap transition-all duration-200 ${isNavHovering ? 'w-auto opacity-100' : 'w-0 opacity-0 overflow-hidden'}`}>
                            RESET
                        </span>
                    </button>
                </div>

            </aside>
        </div>
    );
};
export default Sidebar;
