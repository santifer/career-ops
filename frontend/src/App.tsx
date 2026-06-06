import { AppProvider } from './state/AppContext';
import { TwoPane } from './components/layout/TwoPane';

export default function App() {
  return (
    <AppProvider>
      <TwoPane />
    </AppProvider>
  );
}
