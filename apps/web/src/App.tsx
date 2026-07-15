import { useState } from 'react';
import { Routes, Route } from 'react-router-dom';
import { Header } from './components/Header';
import { SiteFooter } from './components/SiteFooter';
import { DiceRoller } from './components/DiceRoller';
import { SimpleDiceRoller } from './components/SimpleDiceRoller';
import { LoginPage } from './pages/LoginPage';
import { HomePage } from './pages/HomePage';
import { CoreRulesPage } from './pages/CoreRulesPage';
import { WiwonPage } from './pages/WiwonPage';
import { CharactersPage } from './pages/CharactersPage';
import { DwellerSheetPage } from './pages/DwellerSheetPage';
import { DwellerBuildPage } from './pages/DwellerBuildPage';
import { CampaignPage } from './pages/CampaignPage';
import { BoardPage } from './pages/BoardPage';
import { CatalogPage } from './pages/CatalogPage';
import { ShopPage } from './pages/ShopPage';
import { PrayPage } from './pages/PrayPage';
import { ArticleDetailPage } from './pages/ArticleDetailPage';
import { ContentEditorPage } from './pages/ContentEditorPage';
import { Placeholder } from './pages/Placeholder';

export function App() {
  const [diceOpen, setDiceOpen] = useState(false);
  const [simpleDiceOpen, setSimpleDiceOpen] = useState(false);
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
          <Route path="/campaign/:id/board" element={<BoardPage />} />
          <Route path="/magic" element={<CatalogPage key="magic" category="magic" />} />
          <Route path="/equipment" element={<CatalogPage key="equipment" category="equipment" />} />
          <Route path="/monster" element={<CatalogPage key="monster" category="monster" />} />
          <Route path="/shop" element={<ShopPage />} />
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

      {/* Plain dice roller — separate icon, docked to the LEFT */}
      <button
        onClick={() => setSimpleDiceOpen((o) => !o)}
        title="ทอยลูกเต๋าเอง (d2–d20)"
        aria-label="เปิดหน้าต่างทอยลูกเต๋าเอง"
        style={{ position: 'fixed', left: 22, bottom: 22, zIndex: 150, width: 56, height: 56, borderRadius: '50%', border: `1px solid ${simpleDiceOpen ? '#c79a2e' : '#e0d7c2'}`, background: simpleDiceOpen ? '#463f34' : '#fff', color: simpleDiceOpen ? '#f7dca0' : '#8a6a3a', cursor: 'pointer', boxShadow: '0 8px 24px rgba(0,0,0,.18)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1, lineHeight: 1 }}
      >
        <span style={{ fontSize: 20 }}>⬢</span>
        <span style={{ fontSize: 8.5, fontWeight: 800, letterSpacing: '.02em' }}>d20</span>
      </button>
      <SimpleDiceRoller open={simpleDiceOpen} onClose={() => setSimpleDiceOpen(false)} />
    </>
  );
}
