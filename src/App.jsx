import { useState, useMemo, useEffect } from 'react'
import { CHARTS, CATEGORIES, CATEGORY_META } from './registry.js'

// ── Mobile detection ────────────────────────────────────────────
function useIsMobile() {
  const [mobile, setMobile] = useState(() => window.innerWidth < 768)
  useEffect(() => {
    const fn = () => setMobile(window.innerWidth < 768)
    window.addEventListener('resize', fn)
    return () => window.removeEventListener('resize', fn)
  }, [])
  return mobile
}

// ── Shared style tokens ─────────────────────────────────────────
const BG0 = '#060e1a'
const BG1 = '#080f1c'
const BORDER = '#0d2035'
const TEXT_HI = '#e8f4ff'
const TEXT_MID = '#5a8ab0'
const TEXT_LO = '#2a4a6a'
const ACCENT = '#5bb8ff'

const S = {
  app: {
    display: 'flex', minHeight: '100vh', background: BG0,
    fontFamily: "'IBM Plex Sans', sans-serif",
  },

  // ── Desktop sidebar ──────────────────────────────────────────
  sidebar: {
    width: 280, minWidth: 280, background: BG1,
    borderRight: `1px solid ${BORDER}`, display: 'flex',
    flexDirection: 'column', position: 'sticky', top: 0,
    height: '100vh', overflowY: 'auto',
  },
  sidebarHeader: { padding: '28px 20px 16px', borderBottom: `1px solid ${BORDER}` },
  wordmark: {
    fontSize: 11, fontWeight: 600, color: '#3a6a9a',
    letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 4,
  },
  sidebarTitle: { fontSize: 18, fontWeight: 600, color: TEXT_HI, lineHeight: 1.2 },
  sidebarSubtitle: { fontSize: 11, color: TEXT_LO, marginTop: 6 },
  searchWrap: { padding: '12px 16px', borderBottom: `1px solid ${BORDER}` },
  searchInput: {
    width: '100%', background: '#0a1826', border: `1px solid #1a3050`,
    borderRadius: 6, padding: '7px 10px', fontSize: 12,
    color: '#c8d8e8', fontFamily: "'IBM Plex Sans', sans-serif", outline: 'none',
    boxSizing: 'border-box',
  },
  catSection: { padding: '10px 0' },
  catLabel: {
    fontSize: 10, fontWeight: 600, letterSpacing: '0.12em',
    textTransform: 'uppercase', color: TEXT_LO,
    padding: '8px 20px 5px', display: 'flex', alignItems: 'center', gap: 6,
  },
  catDot: (color) => ({
    display: 'inline-block', width: 6, height: 6,
    borderRadius: '50%', background: color, flexShrink: 0,
  }),
  chartItem: (active) => ({
    padding: '8px 20px', cursor: 'pointer',
    background: active ? '#0d2035' : 'transparent',
    borderLeft: active ? `2px solid ${ACCENT}` : '2px solid transparent',
    transition: 'background 0.1s',
  }),
  chartItemTitle: (active) => ({
    fontSize: 13, color: active ? TEXT_HI : TEXT_MID,
    fontWeight: active ? 500 : 400, lineHeight: 1.35,
  }),

  // ── Main panel ───────────────────────────────────────────────
  main: { flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 },
  topBar: {
    padding: '14px 28px', borderBottom: `1px solid ${BORDER}`,
    background: BG1, position: 'sticky', top: 0, zIndex: 10,
    display: 'flex', alignItems: 'center', gap: 12,
  },
  catBadge: (color) => ({
    fontSize: 10, fontWeight: 600, letterSpacing: '0.1em',
    textTransform: 'uppercase', color, padding: '3px 8px',
    background: color + '18', border: `1px solid ${color}35`,
    borderRadius: 4, whiteSpace: 'nowrap',
  }),
  topBarTitle: { fontSize: 16, fontWeight: 500, color: TEXT_HI },
  content: { flex: 1, overflow: 'auto' },
  empty: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    height: '60vh', flexDirection: 'column', gap: 12,
  },
  emptyText: { fontSize: 14, color: TEXT_LO },
  hint: {
    margin: '0 28px 28px', padding: '12px 16px',
    background: BG1, border: `1px solid ${BORDER}`,
    borderLeft: '3px solid #1e4a7a', borderRadius: 6,
    fontSize: 12, color: '#3a6a8a', lineHeight: 1.8,
  },
  code: { fontFamily: "'IBM Plex Mono', monospace", color: ACCENT, fontSize: 11 },
}

// ── Chart list (shared between sidebar and drawer) ──────────────
function ChartList({ grouped, activeId, onSelect, search, setSearch, compact = false }) {
  return (
    <>
      <div style={{ padding: compact ? '10px 14px' : '12px 16px', borderBottom: `1px solid ${BORDER}` }}>
        <input
          style={{ ...S.searchInput, fontSize: compact ? 14 : 12 }}
          placeholder="Search charts…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          autoComplete="off"
        />
      </div>
      <nav style={{ ...S.catSection, overflowY: 'auto', flex: 1 }}>
        {Object.values(grouped).map(cat => (
          <div key={cat.id}>
            <div style={{ ...S.catLabel, fontSize: compact ? 11 : 10, padding: compact ? '10px 16px 6px' : '8px 20px 5px' }}>
              <span style={S.catDot(cat.color)} />
              {cat.label}
            </div>
            {cat.charts.map(chart => (
              <div
                key={chart.id}
                style={{
                  ...S.chartItem(chart.id === activeId),
                  padding: compact ? '12px 16px' : '8px 20px',
                }}
                onClick={() => onSelect(chart.id)}
              >
                <div style={{ ...S.chartItemTitle(chart.id === activeId), fontSize: compact ? 15 : 13 }}>
                  {chart.title}
                </div>
              </div>
            ))}
          </div>
        ))}
        {Object.keys(grouped).length === 0 && (
          <div style={{ padding: '20px', fontSize: 13, color: TEXT_LO }}>
            No charts match "{search}"
          </div>
        )}
      </nav>
    </>
  )
}

// ── Mobile top bar ──────────────────────────────────────────────
function MobileTopBar({ active, activeCatMeta, onMenuOpen }) {
  return (
    <div style={{
      position: 'sticky', top: 0, zIndex: 20,
      background: BG1, borderBottom: `1px solid ${BORDER}`,
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '12px 16px',
    }}>
      {/* Hamburger */}
      <button
        onClick={onMenuOpen}
        style={{
          background: '#0d2035', border: `1px solid ${BORDER}`,
          borderRadius: 8, width: 38, height: 38, flexShrink: 0,
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', gap: 4, cursor: 'pointer', padding: 0,
        }}
      >
        {[0,1,2].map(i => (
          <span key={i} style={{ display: 'block', width: 16, height: 1.5, background: ACCENT, borderRadius: 1 }} />
        ))}
      </button>

      <div style={{ flex: 1, minWidth: 0 }}>
        {activeCatMeta && (
          <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: activeCatMeta.color, marginBottom: 2 }}>
            {activeCatMeta.label}
          </div>
        )}
        <div style={{ fontSize: 14, fontWeight: 500, color: TEXT_HI, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {active ? active.title : 'Chart Gallery'}
        </div>
      </div>

      {/* Roberts Vision wordmark */}
      <div style={{ fontSize: 9, fontWeight: 600, color: '#3a6a9a', letterSpacing: '0.12em', textTransform: 'uppercase', flexShrink: 0 }}>
        RV
      </div>
    </div>
  )
}

// ── Mobile bottom drawer ────────────────────────────────────────
function MobileDrawer({ open, onClose, grouped, activeId, onSelect, search, setSearch }) {
  // Trap scroll when open
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
          zIndex: 40, opacity: open ? 1 : 0,
          pointerEvents: open ? 'auto' : 'none',
          transition: 'opacity 0.25s',
        }}
      />
      {/* Sheet */}
      <div style={{
        position: 'fixed', left: 0, right: 0, bottom: 0,
        height: '75vh', background: BG1,
        borderRadius: '18px 18px 0 0', border: `1px solid ${BORDER}`,
        zIndex: 50, display: 'flex', flexDirection: 'column',
        transform: open ? 'translateY(0)' : 'translateY(100%)',
        transition: 'transform 0.3s cubic-bezier(0.4,0,0.2,1)',
        boxShadow: '0 -8px 40px rgba(0,0,0,0.5)',
      }}>
        {/* Drag handle + header */}
        <div style={{ padding: '12px 16px 10px', borderBottom: `1px solid ${BORDER}`, flexShrink: 0 }}>
          <div style={{ width: 36, height: 4, background: '#1a3050', borderRadius: 2, margin: '0 auto 12px' }} />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 600, color: '#3a6a9a', letterSpacing: '0.14em', textTransform: 'uppercase' }}>Roberts Vision</div>
              <div style={{ fontSize: 16, fontWeight: 600, color: TEXT_HI }}>Chart Gallery</div>
            </div>
            <button
              onClick={onClose}
              style={{ background: '#0d2035', border: `1px solid ${BORDER}`, borderRadius: 8, width: 34, height: 34, color: TEXT_MID, fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >✕</button>
          </div>
        </div>
        <ChartList
          grouped={grouped} activeId={activeId}
          onSelect={(id) => { onSelect(id); onClose(); }}
          search={search} setSearch={setSearch} compact={true}
        />
      </div>
    </>
  )
}

// ── Root ────────────────────────────────────────────────────────
export default function App() {
  const isMobile = useIsMobile()
  const [activeId, setActiveId] = useState(CHARTS[0]?.id ?? null)
  const [search, setSearch] = useState('')
  const [drawerOpen, setDrawerOpen] = useState(false)

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    if (!q) return CHARTS
    return CHARTS.filter(c =>
      c.title.toLowerCase().includes(q) || c.category.toLowerCase().includes(q)
    )
  }, [search])

  const grouped = useMemo(() => {
    const map = {}
    for (const cat of CATEGORIES) {
      const charts = filtered.filter(c => c.category === cat.id)
      if (charts.length) map[cat.id] = { ...cat, charts }
    }
    for (const chart of filtered) {
      if (!map[chart.category]) {
        map[chart.category] = {
          id: chart.category,
          label: chart.category.charAt(0).toUpperCase() + chart.category.slice(1),
          color: '#a78bfa',
          charts: filtered.filter(c => c.category === chart.category),
        }
      }
    }
    return map
  }, [filtered])

  const active = CHARTS.find(c => c.id === activeId)
  const ActiveComponent = active?.component ?? null
  const activeCatMeta = active
    ? (CATEGORY_META[active.category] ?? { label: active.category, color: '#a78bfa' })
    : null

  // ── MOBILE ──────────────────────────────────────────────────
  if (isMobile) {
    return (
      <div style={{ ...S.app, flexDirection: 'column', minHeight: '100vh' }}>
        <MobileTopBar active={active} activeCatMeta={activeCatMeta} onMenuOpen={() => setDrawerOpen(true)} />

        <div style={{ flex: 1, overflow: 'auto' }}>
          {active ? (
            <>
              <ActiveComponent />
              <div style={{ ...S.hint, margin: '0 16px 28px', fontSize: 11 }}>
                <strong style={{ color: ACCENT }}>To add a chart:</strong>{' '}
                Drop a <span style={S.code}>.jsx</span> into <span style={S.code}>src/charts/&lt;category&gt;/</span>
              </div>
            </>
          ) : (
            <div style={S.empty}>
              <div style={S.emptyText}>Tap ☰ to select a chart</div>
            </div>
          )}
        </div>

        <MobileDrawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          grouped={grouped}
          activeId={activeId}
          onSelect={setActiveId}
          search={search}
          setSearch={setSearch}
        />
      </div>
    )
  }

  // ── DESKTOP ──────────────────────────────────────────────────
  return (
    <div style={S.app}>
      <aside style={S.sidebar}>
        <div style={S.sidebarHeader}>
          <div style={S.wordmark}>Roberts Vision</div>
          <div style={S.sidebarTitle}>Chart Gallery</div>
          <div style={S.sidebarSubtitle}>
            {CHARTS.length} chart{CHARTS.length !== 1 ? 's' : ''} · {CATEGORIES.length} categor{CATEGORIES.length !== 1 ? 'ies' : 'y'}
          </div>
        </div>
        <ChartList
          grouped={grouped} activeId={activeId}
          onSelect={setActiveId}
          search={search} setSearch={setSearch}
        />
      </aside>

      <main style={S.main}>
        {active ? (
          <>
            <div style={S.topBar}>
              {activeCatMeta && <span style={S.catBadge(activeCatMeta.color)}>{activeCatMeta.label}</span>}
              <span style={S.topBarTitle}>{active.title}</span>
            </div>
            <div style={S.content}>
              <ActiveComponent />
              <div style={S.hint}>
                <strong style={{ color: ACCENT }}>To add or rename a chart</strong><br />
                Drop any <span style={S.code}>.jsx</span> into <span style={S.code}>src/charts/&lt;category&gt;/</span> — the filename is the title.
                Rename the file → title updates. Move it → category changes. No other edits needed.
              </div>
            </div>
          </>
        ) : (
          <div style={S.empty}>
            <div style={S.emptyText}>Select a chart from the sidebar</div>
          </div>
        )}
      </main>
    </div>
  )
}
