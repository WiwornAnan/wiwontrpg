import { Routes, Route } from 'react-router-dom';
import { Header } from './components/Header';
import { LoginPage } from './pages/LoginPage';
import { HomePage } from './pages/HomePage';
import { CoreRulesPage } from './pages/CoreRulesPage';
import { WiwonPage } from './pages/WiwonPage';
import { CharactersPage } from './pages/CharactersPage';
import { CatalogPage } from './pages/CatalogPage';
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
          <Route path="/wiwon" element={<WiwonPage />} />
          <Route path="/wiwon/:id" element={<ArticleDetailPage category="wiwon" />} />
          <Route path="/characters" element={<CharactersPage />} />
          <Route path="/characters/:id" element={<ArticleDetailPage category="characters" />} />
          <Route path="/magic" element={<CatalogPage category="magic" />} />
          <Route path="/equipment" element={<CatalogPage category="equipment" />} />
          <Route path="/monster" element={<CatalogPage category="monster" />} />
          <Route path="/pray" element={<Placeholder title="Pray to the Creator" note="Phase 5" />} />
          <Route path="/editor" element={<ContentEditorPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="*" element={<Placeholder title="ไม่พบหน้านี้" note="404" />} />
        </Routes>
      </main>
    </>
  );
}
