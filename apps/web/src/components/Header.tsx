import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { NAV_ITEMS, type SearchHit, type Announcement } from '@wiwonanant/shared';
import { useAuth } from '../auth/AuthContext';
import { api } from '../lib/api';
import { Modal } from './Modal';
import { AccountModal } from './AccountModal';
import { Button, inputStyle } from './ui';
import styles from './Header.module.css';

function isNavActive(href: string, pathname: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(href + '/');
}

export function Header() {
  const { user, isDev } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const qc = useQueryClient();
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [announceOpen, setAnnounceOpen] = useState(false);
  const [announceDraft, setAnnounceDraft] = useState('');
  const [catOpen, setCatOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const catRef = useRef<HTMLDivElement>(null);
  const catMenuRef = useRef<HTMLDivElement>(null);

  const { data: announcement } = useQuery({
    queryKey: ['announcement'],
    queryFn: () => api.get<{ announcement: Announcement | null }>('/announcements'),
  });

  const { data: search } = useQuery({
    queryKey: ['search', query],
    queryFn: () => api.get<{ hits: SearchHit[] }>(`/search?q=${encodeURIComponent(query)}`),
    enabled: query.trim().length > 0,
  });

  const claimCr = useMutation({
    mutationFn: () => api.post('/credits/claim'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['me'] }),
  });

  const postAnnounce = useMutation({
    mutationFn: () => api.post('/announcements', { body: announceDraft }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['announcement'] });
      setAnnounceOpen(false);
      setAnnounceDraft('');
    },
  });
  const clearAnnounce = useMutation({
    mutationFn: () => api.delete('/announcements'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['announcement'] }),
  });

  // Close search dropdown on outside click (onBlur-style, no full-screen backdrop).
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setSearchOpen(false);
      if (catRef.current && !catRef.current.contains(e.target as Node) && !catMenuRef.current?.contains(e.target as Node)) setCatOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);
  // Close the catalog dropdown whenever the route changes.
  useEffect(() => setCatOpen(false), [location.pathname]);

  const hits = search?.hits ?? [];
  const showResults = searchOpen && query.trim().length > 0;
  // Group the three long reference catalogs under one dropdown to keep the bar short.
  const CATALOG_IDS = ['magic', 'equipment', 'monster'];
  const catalogItems = NAV_ITEMS.filter((n) => CATALOG_IDS.includes(n.id));
  const catalogActive = catalogItems.some((n) => isNavActive(n.href, location.pathname));

  return (
    <header className={styles.header}>
      <div className={styles.bar}>
        <div className={styles.brand} onClick={() => navigate('/')}>
          <div className={styles.brandMark}>
            <span />
          </div>
          <span className={styles.brandName}>Wiwon&#8202;Anant</span>
        </div>

        <nav className={styles.nav}>
          {NAV_ITEMS.filter((n) => ['home', 'core-rules', 'wiwon', 'characters'].includes(n.id)).map((n) => (
            <Link
              key={n.id}
              to={n.href}
              className={`${styles.navBtn} ${isNavActive(n.href, location.pathname) ? styles.navBtnActive : ''}`}
            >
              {n.label}
            </Link>
          ))}

          <div ref={catRef} style={{ position: 'relative', flex: 'none' }}>
            <button
              onClick={() => setCatOpen((o) => !o)}
              className={`${styles.navBtn} ${catalogActive ? styles.navBtnActive : ''}`}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
            >
              คลังข้อมูล
              <span style={{ fontSize: 9, opacity: 0.7, transform: catOpen ? 'rotate(180deg)' : 'none', transition: 'transform .12s' }}>▼</span>
            </button>
            {catOpen && catRef.current && createPortal(
              (() => {
                const r = catRef.current!.getBoundingClientRect();
                return (
                  <div ref={catMenuRef} style={{ position: 'fixed', top: r.bottom + 6, left: r.left, minWidth: 200, background: '#fff', border: '1px solid var(--border)', borderRadius: 12, boxShadow: '0 16px 40px rgba(0,0,0,.16)', padding: 6, zIndex: 200 }}>
                    {catalogItems.map((n) => (
                      <Link
                        key={n.id}
                        to={n.href}
                        onClick={() => setCatOpen(false)}
                        style={{ display: 'block', padding: '9px 12px', borderRadius: 8, fontSize: 13, fontWeight: 500, color: isNavActive(n.href, location.pathname) ? '#15140f' : '#5f5c54', background: isNavActive(n.href, location.pathname) ? '#f0eee9' : 'transparent' }}
                      >
                        {n.label}
                      </Link>
                    ))}
                  </div>
                );
              })(),
              document.body,
            )}
          </div>

          {NAV_ITEMS.filter((n) => n.id === 'pray').map((n) => (
            <Link
              key={n.id}
              to={n.href}
              className={`${styles.navBtn} ${isNavActive(n.href, location.pathname) ? styles.navBtnActive : ''}`}
            >
              {n.label}
            </Link>
          ))}
          {user && (
            <Link
              to="/dweller"
              className={`${styles.navBtn} ${styles.navDweller} ${isNavActive('/dweller', location.pathname) ? styles.navBtnActive : ''}`}
            >
              🗎 Dweller Sheet
            </Link>
          )}
        </nav>

        <div className={styles.right}>
          <div className={styles.searchWrap} ref={searchRef}>
            <div className={styles.searchBox}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#a8a59d" strokeWidth="2">
                <circle cx="11" cy="11" r="7" />
                <path d="m21 21-4.3-4.3" />
              </svg>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onFocus={() => setSearchOpen(true)}
                placeholder="ค้นหา…"
              />
              {query && (
                <button
                  onClick={() => setQuery('')}
                  style={{ background: 'none', border: 'none', color: '#a8a59d', cursor: 'pointer', fontSize: 15 }}
                >
                  ×
                </button>
              )}
            </div>
            {showResults && (
              <div className={styles.results}>
                {hits.length > 0 ? (
                  hits.map((h) => (
                    <div
                      key={`${h.kind}-${h.id}`}
                      className={styles.resultRow}
                      onClick={() => {
                        setQuery('');
                        setSearchOpen(false);
                        navigate(h.href);
                      }}
                    >
                      <span className={styles.resultIcon} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.3 }}>{h.title}</div>
                        <div style={{ fontSize: 11, color: '#9a978e' }}>{h.categoryLabel}</div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div style={{ padding: '22px 14px', textAlign: 'center', color: '#a8a59d', fontSize: 12.5 }}>
                    ไม่พบผลลัพธ์สำหรับ "{query}"
                  </div>
                )}
              </div>
            )}
          </div>

          <button className={styles.iconBtn} title="การแจ้งเตือน">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
              <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
            </svg>
          </button>

          {user ? (
            <>
              <button
                className={`${styles.crBadge} ${user.canClaimCredits ? styles.crBadgeClaimable : ''}`}
                title={user.canClaimCredits ? 'รับ 3 Cr. ประจำวัน (รีเซ็ตตี 3)' : 'รับ Cr. วันนี้แล้ว'}
                onClick={() => user.canClaimCredits && claimCr.mutate()}
              >
                <span style={{ fontSize: 13, fontWeight: 800 }}>{user.creditBalance}</span>
                <span style={{ fontSize: 9.5, fontWeight: 700, opacity: 0.85 }}>Cr.</span>
                {user.canClaimCredits && (
                  <span style={{ fontSize: 9, fontWeight: 800, background: '#fff', color: '#c78a2a', borderRadius: 5, padding: '1px 5px', marginLeft: 2 }}>
                    +3
                  </span>
                )}
              </button>
              <button className={styles.avatar} onClick={() => setAccountOpen(true)} title="บัญชีของฉัน">
                <span className={styles.avatarName}>{user.displayName}</span>
                <span className={styles.avatarInitial}>{user.displayName.charAt(0)}</span>
              </button>
            </>
          ) : (
            <button className={styles.loginBtn} onClick={() => navigate('/login')}>
              Log in
            </button>
          )}
        </div>
      </div>

      {isDev && (
        <div className={styles.devBar}>
          <div className={styles.devBarInner}>
            <span className={styles.devTag}>
              <span className={styles.devDot} />
              DEVELOPER MODE
            </span>
            <span style={{ color: '#8d8a82' }}>— คุณสามารถแก้ไขเนื้อหาในเว็บไซต์ได้</span>
            <button className={styles.devBtn} style={{ marginLeft: 'auto' }} onClick={() => setAnnounceOpen(true)}>
              📢 ประกาศถึงผู้ใช้
            </button>
            <button className={styles.devBtn} onClick={() => navigate('/editor')}>
              เปิด Content Editor →
            </button>
          </div>
        </div>
      )}

      {announcement?.announcement && (
        <div className={styles.announce}>
          <div className={styles.announceInner}>
            <span style={{ fontSize: 15, flex: 'none' }}>📢</span>
            <span style={{ flex: 1, fontWeight: 500 }}>{announcement.announcement.body}</span>
            {isDev && (
              <button
                onClick={() => clearAnnounce.mutate()}
                style={{ background: 'rgba(255,255,255,.2)', border: 'none', color: '#fff', borderRadius: 6, padding: '4px 11px', fontSize: 11.5, cursor: 'pointer', flex: 'none' }}
              >
                ลบประกาศ
              </button>
            )}
          </div>
        </div>
      )}

      <Modal
        open={announceOpen}
        onClose={() => setAnnounceOpen(false)}
        title="📢 ประกาศถึงผู้ใช้"
        footer={
          <>
            <Button variant="ghost" onClick={() => setAnnounceOpen(false)}>ยกเลิก</Button>
            <Button variant="coral" onClick={() => announceDraft.trim() && postAnnounce.mutate()} disabled={postAnnounce.isPending}>ประกาศ</Button>
          </>
        }
      >
        <textarea
          value={announceDraft}
          onChange={(e) => setAnnounceDraft(e.target.value)}
          placeholder="ข้อความประกาศที่จะแสดงแถบบนสุดให้ผู้ใช้ทุกคนเห็น…"
          style={{ ...inputStyle, minHeight: 90, resize: 'vertical' }}
          autoFocus
        />
      </Modal>

      <AccountModal open={accountOpen} onClose={() => setAccountOpen(false)} />
    </header>
  );
}
