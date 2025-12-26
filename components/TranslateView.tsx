import React, { useRef } from 'react';
import { TranslateViewProps, InputType } from '../types';
import { LANGUAGES } from '../constants';

const TranslateView: React.FC<TranslateViewProps> = ({ data, updateData, onRun, onClear }) => {
    const { codeText, inputLanguage, targetLanguage, translateResult, isLoading, inputType, imagePreviewUrl } = data;
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            const url = URL.createObjectURL(file);
            updateData({ imageFile: file, imagePreviewUrl: url });
        }
    };

    const handleTypeChange = (type: InputType) => {
        updateData({
            inputType: type,
            codeText: '',
            imageFile: null,
            imagePreviewUrl: null,
            translateResult: null
        });
    };

    const isDisabled = isLoading || (!codeText && !imagePreviewUrl);

    return (
        <main className="flex-1 flex flex-col bg-transparent p-0 overflow-hidden">
            {/* Header */}
            <header className="flex-shrink-0 flex justify-between items-start px-8 pt-6 pb-4 z-10">
                <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-3">
                        <span className="p-1.5 glass-pane rounded-lg shadow-sm">
                            <span className="material-icons-round text-lg text-primary">translate</span>
                        </span>
                        <h1 className="text-xl font-bold text-slate-900 dark:text-white text-glass-shadow">Translate Code</h1>
                    </div>
                    <p className="text-slate-700 dark:text-slate-200 font-medium text-xs ml-[44px]">
                        Convert code between programming languages.
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
                        title="Reset Translate tab"
                        className="flex items-center space-x-2 px-4 py-1.5 text-sm font-semibold text-red-500 glass-pane border border-red-200/30 rounded-lg hover:bg-red-50/50 dark:hover:bg-red-900/20 transition-all shadow-sm hover:shadow-md"
                    >
                        <span className="material-icons-round text-base">delete</span>
                        <span>Clear</span>
                    </button>
                </div>
            </header>

            {/* Content Area */}
            <div className="flex-1 flex flex-col min-h-0 px-8 overflow-hidden">
                {/* Radio Buttons */}
                <div className="flex-shrink-0 py-4 flex space-x-6 items-center">
                    <label className="inline-flex items-center cursor-pointer group">
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center mr-2 transition-colors ${inputType === 'text' ? 'border-primary' : 'border-slate-400 dark:border-slate-500'}`}>
                            {inputType === 'text' && <div className="w-3 h-3 bg-primary rounded-full"></div>}
                        </div>
                        <input
                            type="radio"
                            name="translateInputType"
                            checked={inputType === 'text'}
                            onChange={() => handleTypeChange('text')}
                            className="hidden"
                        />
                        <span className={`text-sm font-bold transition-colors ${inputType === 'text' ? 'text-primary' : 'text-slate-700 dark:text-slate-200'}`}>Text Code</span>
                    </label>

                    <label className="inline-flex items-center cursor-pointer group">
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center mr-2 transition-colors ${inputType === 'image' ? 'border-primary' : 'border-slate-400 dark:border-slate-500'}`}>
                            {inputType === 'image' && <div className="w-3 h-3 bg-primary rounded-full"></div>}
                        </div>
                        <input
                            type="radio"
                            name="translateInputType"
                            checked={inputType === 'image'}
                            onChange={() => handleTypeChange('image')}
                            className="hidden"
                        />
                        <span className={`text-sm font-bold transition-colors ${inputType === 'image' ? 'text-primary' : 'text-slate-700 dark:text-slate-200'}`}>Image Upload</span>
                    </label>
                </div>

                {/* Main Grid */}
                <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-6 min-h-0 pb-6">
                    {/* Left: Source Code */}
                    <div className="flex flex-col h-full card-neon shadow-2xl">
                        <div className="flex-shrink-0 px-4 py-3 border-b border-white/10 flex justify-between items-center bg-white/30 dark:bg-black/20 backdrop-blur-md">
                            <span className="font-bold text-xs uppercase tracking-wider text-slate-600 dark:text-slate-300">Source Code</span>
                            <div className="flex items-center">
                                <select
                                    value={inputLanguage}
                                    onChange={(e) => updateData({ inputLanguage: e.target.value })}
                                    className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-md py-1 pl-2 pr-6 text-xs font-bold text-slate-700 dark:text-slate-200 focus:ring-1 focus:ring-primary outline-none cursor-pointer hover:border-slate-300 transition-colors appearance-none"
                                >
                                    {LANGUAGES.map(lang => <option key={lang} value={lang}>{lang}</option>)}
                                </select>
                                <span className="material-icons-round text-sm text-slate-400 -ml-5 pointer-events-none">expand_more</span>
                            </div>
                        </div>
                        <div className="flex-1 relative p-0 bg-white/40 dark:bg-slate-900/20">
                            {inputType === 'text' ? (
                                <textarea
                                    value={codeText}
                                    onChange={(e) => updateData({ codeText: e.target.value })}
                                    className="w-full h-full bg-transparent p-4 text-sm font-mono text-slate-900 dark:text-slate-100 resize-none outline-none placeholder-slate-400 dark:placeholder-slate-500 leading-relaxed font-medium overflow-scroll whitespace-nowrap code-scroll-area"
                                    placeholder="Paste your code here..."
                                    spellCheck={false}
                                    wrap="off"
                                />
                            ) : (
                                <div className="w-full h-full p-4 overflow-scroll code-scroll-area">
                                    <div className="w-full h-full border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-lg flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors relative cursor-pointer group">
                                        <input
                                            type="file"
                                            ref={fileInputRef}
                                            onChange={handleFileChange}
                                            accept="image/*"
                                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                        />
                                        {imagePreviewUrl ? (
                                            <div className="relative w-full h-full rounded overflow-hidden">
                                                <img src={imagePreviewUrl} alt="Preview" className="w-full h-full object-contain" />
                                                <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                                                    <span className="text-white font-medium bg-black/50 px-3 py-1 rounded-full text-sm backdrop-blur-sm shadow-lg">Click to change</span>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="flex flex-col items-center text-slate-500 dark:text-slate-400 group-hover:text-primary transition-colors">
                                                <span className="material-icons-round text-5xl mb-3">add_photo_alternate</span>
                                                <p className="text-sm font-semibold">Click to upload code screenshot</p>
                                                <p className="text-xs mt-1">Supports PNG, JPG</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Right: Translated Code */}
                    <div className="flex flex-col h-full card-neon shadow-2xl">
                        <div className="flex-shrink-0 px-4 py-3 border-b border-white/10 flex justify-between items-center bg-white/30 dark:bg-black/20 backdrop-blur-md">
                            <span className="font-bold text-xs uppercase tracking-wider text-slate-600 dark:text-slate-300">Translated Code</span>
                            <div className="flex items-center gap-2">
                                <select
                                    value={targetLanguage}
                                    onChange={(e) => updateData({ targetLanguage: e.target.value })}
                                    className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-md py-1 pl-2 pr-6 text-xs font-bold text-slate-700 dark:text-slate-200 focus:ring-1 focus:ring-primary outline-none cursor-pointer hover:border-slate-300 transition-colors appearance-none"
                                >
                                    {LANGUAGES.map(lang => <option key={lang} value={lang}>{lang}</option>)}
                                </select>
                                <span className="material-icons-round text-sm text-slate-400 -ml-5 pointer-events-none">expand_more</span>
                                <button
                                    onClick={() => navigator.clipboard.writeText(translateResult?.translatedCode || '')}
                                    className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors ml-2"
                                    title="Copy"
                                    disabled={!translateResult?.translatedCode}
                                >
                                    <span className="material-icons-round text-lg">content_copy</span>
                                </button>
                                <button
                                    onClick={() => {
                                        const blob = new Blob([translateResult?.translatedCode || ''], { type: 'text/plain' });
                                        const url = URL.createObjectURL(blob);
                                        const a = document.createElement('a');
                                        a.href = url;
                                        a.download = `translated_code.${targetLanguage.toLowerCase()}`;
                                        a.click();
                                        URL.revokeObjectURL(url);
                                    }}
                                    className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                                    title="Download"
                                    disabled={!translateResult?.translatedCode}
                                >
                                    <span className="material-icons-round text-lg">download</span>
                                </button>
                            </div>
                        </div>
                        <div className="flex-1 p-0 bg-white/40 dark:bg-slate-900/20 overflow-scroll code-scroll-area">
                            {isLoading ? (
                                <div className="w-full h-full flex items-center justify-center flex-col bg-white/50 dark:bg-black/20 backdrop-blur-sm">
                                    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary mb-4"></div>
                                    <p className="text-sm font-bold text-slate-900 dark:text-white animate-pulse">Translating...</p>
                                </div>
                            ) : translateResult?.translatedCode ? (
                                <div className="p-4 text-sm font-mono whitespace-pre leading-relaxed text-slate-700 dark:text-slate-200 font-medium">
                                    {translateResult.translatedCode}
                                </div>
                            ) : (
                                <div className="w-full h-full flex items-center justify-center text-center p-8">
                                    <p className="text-sm text-slate-400 dark:text-slate-500 italic">
                                        Translated code appears here.
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Action Button */}
            <div className="flex-shrink-0 py-6 border-t border-white/10 flex justify-center z-20">
                <button
                    onClick={onRun}
                    disabled={isDisabled}
                    title={!isDisabled ? "Click to translate code" : undefined}
                    className={`
                        flex items-center gap-2 px-8 py-3 rounded-xl 
                        font-bold text-base transition-all transform 
                        ${isDisabled
                            ? 'bg-slate-300 dark:bg-slate-600 text-slate-500 dark:text-slate-300 cursor-not-allowed border-2 border-slate-400 dark:border-slate-500 shadow-md'
                            : 'bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white shadow-xl shadow-violet-500/30 hover:shadow-violet-500/50 hover:scale-105 active:scale-95'
                        }
                    `}
                >
                    {isLoading ? (
                        <span className="material-icons-round animate-spin">refresh</span>
                    ) : (
                        <span className="material-icons-round">translate</span>
                    )}
                    Translate
                </button>
            </div>
        </main>
    );
};

export default TranslateView;