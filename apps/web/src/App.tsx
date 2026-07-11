import { useState } from 'react';
import { Routes, Route } from 'react-router-dom';
import { Header } from './components/Header';
import { SiteFooter } from './components/SiteFooter';
import { DiceRoller } from './components/DiceRoller';
import { LoginPage } from './pages/LoginPage';
import { HomePage } from './pages/HomePage';
import { CoreRulesPage } from './pages/CoreRulesPage';
import { WiwonPage } from './pages/WiwonPage';
import { CharactersPage } from './pages/CharactersPage';
import { DwellerSheetPage } from './pages/DwellerSheetPage';
import { DwellerBuildPage } from './pages/DwellerBuildPage';
import { CampaignPage } from './pages/CampaignPage';
import { CatalogPage } from './pages/CatalogPage';
import { PrayPage } from './pages/PrayPage';
import { ArticleDetailPage } from './pages/ArticleDetailPage';
import { ContentEditorPage } from './pages/ContentEditorPage';
import { Placeholder } from './pages/Placeholder';

export function App() {
  const [diceOpen, setDiceOpen] = useState(false);
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
          <Route path="/dweller" element={<DwellerSheetPage />} />
          <Route path="/dweller/build/:id" element={<DwellerBuildPage mode="build" />} />
          <Route path="/dweller/sheet/:id" element={<DwellerBuildPage mode="sheet" />} />
          <Route path="/campaign/:id" element={<CampaignPage />} />
          <Route path="/magic" element={<CatalogPage key="magic" category="magic" />} />
          <Route path="/equipment" element={<CatalogPage key="equipment" category="equipment" />} />
          <Route path="/monster" element={<CatalogPage key="monster" category="monster" />} />
          <Route path="/pray" element={<PrayPage />} />
          <Route path="/editor" element={<ContentEditorPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="*" element={<Placeholder title="ไม่พบหน้านี้" note="404" />} />
        </Routes>
      </main>
      <SiteFooter />

      <button
        onClick={() => setDiceOpen(true)}
        title="ทอยลูกเต๋า (Dice Astrolabe)"
        aria-label="เปิดหน้าต่างทอยลูกเต๋า"
        style={{ position: 'fixed', right: 22, bottom: 22, zIndex: 150, width: 56, height: 56, borderRadius: '50%', border: '1px solid #3d3a32', background: '#15140f', color: '#f7dca0', fontSize: 26, cursor: 'pointer', boxShadow: '0 8px 24px rgba(0,0,0,.35)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
        🎲
      </button>
      <DiceRoller open={diceOpen} onClose={() => setDiceOpen(false)} />
    </>
  );
}
