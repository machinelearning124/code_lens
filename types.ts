import React from 'react';

export enum TabId {
  Summarize = 'summarize',
  Decode = 'decode',
  Translate = 'translate',
  Optimize = 'optimize',
  OCR = 'ocr',
}

export type InputType = 'text' | 'image';

export interface TraceStep {
  step: number;
  line: number;
  variables: Record<string, { value: string; type: string; history?: string[] }>;
  explanation: string;
  output: string;
  blockId: string;
  loop_stack?: Record<string, { value: string; type: string; history?: string[] }>[];
}

export interface DecodeResult {
  steps: TraceStep[];
  flowchartMermaid: string;
  totalSteps: number;
}

export interface TranslateResult {
  translatedCode: string;
  confidenceScore: string;
  securityScore: string;
}

export interface OptimizeResult {
  optimizedCode: string;
}

export interface TabData {
  inputType: InputType;
  inputLanguage: string; // Language of the source code
  codeText: string;
  imageFile: File | null;
  uploadedImages?: { id: string; file: File; previewUrl: string }[];
  imagePreviewUrl: string | null;
  targetLanguage: string; // Only used for Translate
  output: string;
  isLoading: boolean;
  decodeResult?: DecodeResult | null; // Structured data for Decode tab
  currentStepIndex?: number; // Current step in Decode tab
  translateResult?: TranslateResult | null; // Structured data for Translate tab
  optimizeResult?: OptimizeResult | null; // Structured data for Optimize tab
  isOCRCompleted?: boolean;
  isExtracting?: boolean; // Specific loading state for OCR to avoid triggering main loading spinner
  detectedInputs?: { name: string; type: string }[]; // Variable names and types detected requiring user input
  inputValues?: Record<string, string>; // Values provided by user for inputs
  inputsConfirmed?: boolean; // Whether user has confirmed inputs
}

export interface AppState {
  [TabId.Summarize]: TabData;
  [TabId.Decode]: TabData;
  [TabId.Translate]: TabData;
  [TabId.Optimize]: TabData;
}

export interface SidebarProps {
  apiKey: string;
  setApiKey: (key: string) => void;
  activeTab: TabId;
  setActiveTab: (tab: TabId) => void;
  onReset: () => void;
  model: string;
  setModel: (model: string) => void;
}

export interface TabPanelProps {
  activeTab: TabId;
  data: TabData;
  updateData: (updates: Partial<TabData>) => void;
  setAppState: React.Dispatch<React.SetStateAction<AppState>>;
  onClear: () => void;
  model: string;
  apiKey: string;
}

export interface DecodeViewProps {
  data: TabData;
  updateData: (updates: Partial<TabData>) => void;
  onRun: () => void;
  onClear: () => void;
}

export interface TranslateViewProps {
  data: TabData;
  updateData: (updates: Partial<TabData>) => void;
  onRun: () => void;
  onClear: () => void;
}

export interface OptimizeViewProps {
  data: TabData;
  updateData: (updates: Partial<TabData>) => void;
  onRun: () => void;
  onClear: () => void;
}