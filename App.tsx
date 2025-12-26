import React, { useState } from 'react';
import Sidebar from './components/Sidebar';
import TabPanel from './components/TabPanel';
import { TabId, AppState, TabData } from './types';
import { INITIAL_APP_STATE, INITIAL_TAB_DATA } from './constants';
import ErrorBoundary from './components/ErrorBoundary';

const App: React.FC = () => {
  // Global App State
  const [apiKey, setApiKey] = useState('');
  const [activeTab, setActiveTab] = useState<TabId>(TabId.Summarize);
  const [model, setModel] = useState<string>('gemini-pro-latest');

  // Data for all tabs (preserved when switching)
  const [tabsData, setTabsData] = useState<AppState>(INITIAL_APP_STATE);

  // Helper to update specific tab data
  const updateTabData = (tabId: TabId, updates: Partial<TabData>) => {
    setTabsData(prev => ({
      ...prev,
      [tabId]: { ...prev[tabId], ...updates }
    }));
  };

  // Handler for the global RESET button (clears inputs but NOT model or API key)
  const handleReset = () => {
    // Reset all tabs to initial data state
    setTabsData({
      [TabId.Summarize]: { ...INITIAL_TAB_DATA },
      [TabId.Decode]: { ...INITIAL_TAB_DATA },
      [TabId.Translate]: { ...INITIAL_TAB_DATA },
      [TabId.Optimize]: { ...INITIAL_TAB_DATA },
    });
  };

  // Handler for the local CLEAR button (clears only current tab)
  const handleClearCurrentTab = () => {
    setTabsData(prev => {
      const newState = {
        ...prev,
        [activeTab]: { ...INITIAL_TAB_DATA }
      };

      // Requirement: If clearing Code Overview (Summarize), ALSO clear Decode Logic tab
      if (activeTab === TabId.Summarize) {
        newState[TabId.Decode] = { ...INITIAL_TAB_DATA };
      }

      return newState;
    });
  };

  return (
    <div className="flex h-screen w-screen text-slate-800 dark:text-slate-200 font-sans selection:bg-accent-cyan selection:text-white overflow-hidden relative">

      {/* STATIC GRADIENT BACKGROUND - Eye-Comfort Gray Theme */}
      <div className="fixed inset-0 -z-10 bg-gradient-to-br from-slate-200 via-slate-200 to-slate-300 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950"></div>

      {/* Main Layout - z-10 to sit above background */}
      <div className="relative z-10 flex w-full h-full">
        <Sidebar
          apiKey={apiKey}
          setApiKey={setApiKey}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          onReset={handleReset}
          model={model}
          setModel={setModel}
        />

        <ErrorBoundary>
          <TabPanel
            activeTab={activeTab}
            data={tabsData[activeTab]}
            updateData={(updates) => updateTabData(activeTab, updates)}
            setAppState={setTabsData}
            onClear={handleClearCurrentTab}
            model={model}
            apiKey={apiKey}
          />
        </ErrorBoundary>
      </div>
    </div>
  );
};

export default App;
