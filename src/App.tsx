import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Header } from './components/Header';
import { HomePage } from './pages/HomePage';
import { InspectPage } from './pages/InspectPage';
import { HistoryPage } from './pages/HistoryPage';
import { DemoPage } from './pages/DemoPage';
import { InstallPage } from './pages/InstallPage';

export default function App() {
  return (
    <BrowserRouter>
      <Header />
      <main className="main-content">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/inspect" element={<InspectPage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/history/:id" element={<HistoryPage />} />
          <Route path="/demo" element={<DemoPage />} />
          <Route path="/install" element={<InstallPage />} />
        </Routes>
      </main>
    </BrowserRouter>
  );
}
