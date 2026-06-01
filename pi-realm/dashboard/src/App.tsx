// App - main router and layout

import { useState } from 'react';
import { Sidebar } from './components/layout/Sidebar.tsx';
import { TopBar } from './components/layout/TopBar.tsx';
import { OverviewPage } from './pages/OverviewPage.tsx';
import { ModulePage } from './pages/ModulePage.tsx';
import { getModuleById } from './data/modules.ts';

function App() {
  const [activeModuleId, setActiveModuleId] = useState<string | null>(null);

  const activeModule = activeModuleId ? getModuleById(activeModuleId) : null;

  return (
    <div className="flex min-h-screen bg-ink-50">
      <Sidebar activeModuleId={activeModuleId} onSelect={setActiveModuleId} />
      <main className="flex-1 min-w-0">
        {activeModule ? (
          <>
            <TopBar
              title={activeModule.name}
              subtitle={`/modules/${activeModule.id}`}
            />
            <ModulePage module={activeModule} />
          </>
        ) : (
          <>
            <TopBar title="Overview" subtitle="Pi Realm · System Dashboard" />
            <OverviewPage onSelectModule={setActiveModuleId} />
          </>
        )}
      </main>
    </div>
  );
}

export default App;
