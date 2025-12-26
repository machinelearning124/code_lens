import { TabId, TabData, AppState } from './types';

export const LANGUAGES = [
  "Java",
  "Javascript",
  "Python",
  "SQL Server SQL",
  "MySQL SQL",
  "Spark SQL",
  "C#"
];

export const INITIAL_TAB_DATA: TabData = {
  inputType: 'text',
  inputLanguage: 'Python', // Default input language
  codeText: '',
  imageFile: null,
  imagePreviewUrl: null,
  targetLanguage: 'Javascript',
  output: '',
  isLoading: false,
  isOCRCompleted: false,
  isExtracting: false,
};

export const INITIAL_APP_STATE: AppState = {
  [TabId.Summarize]: { ...INITIAL_TAB_DATA },
  [TabId.Decode]: { ...INITIAL_TAB_DATA },
  [TabId.Translate]: { ...INITIAL_TAB_DATA },
  [TabId.Optimize]: { ...INITIAL_TAB_DATA },
};
