import { Routes, Route } from 'react-router-dom';
import { Header } from './components/Header';
import { LoginPage } from './pages/LoginPage';
import { HomePage } from './pages/HomePage';
import { CoreRulesPage } from './pages/CoreRulesPage';
import { ArticleDetailPage } from './pages/ArticleDetailPage';
import { ContentEditorPage } from './pages/ContentEditorPage';
import { Placeholder } from './pages/Placeholder';

export function App() {
  return (
    <>
      <Header />
      <main>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/core-rules" element={<CoreRulesPage />} />
          <Route path="/core-rules/:id" element={<ArticleDetailPage category="core-rules" />} />
          <Route path="/wiwon" element={<Placeholder title="Wiwon" note="Phase 2" />} />
          <Route path="/wiwon/:id" element={<ArticleDetailPage category="wiwon" />} />
          <Route path="/characters" element={<Placeholder title="Characters" note="Phase 3" />} />
          <Route path="/characters/:id" element={<ArticleDetailPage category="characters" />} />
          <Route path="/magic" element={<Placeholder title="Magic & Feature" note="Phase 4" />} />
          <Route path="/equipment" element={<Placeholder title="Equipment & Items" note="Phase 4" />} />
          <Route path="/monster" element={<Placeholder title="Monster & Organism" note="Phase 4" />} />
          <Route path="/pray" element={<Placeholder title="Pray to the Creator" note="Phase 5" />} />
          <Route path="/editor" element={<ContentEditorPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="*" element={<Placeholder title="ไม่พบหน้านี้" note="404" />} />
        </Routes>
      </main>
    </>
  );
}
