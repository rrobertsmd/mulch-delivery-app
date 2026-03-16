import { useState, useEffect, useCallback } from "react";

const SUPABASE_URL    = "https://ifllitiozrsmjmmtmckg.supabase.co";
const SUPABASE_ANON   = "sb_publishable_Q8ZrolEhgNxWdF4_G1xVFw_vvrD45zE";

// ── Supabase REST helpers ─────────────────────────────────────────────────────
const sb = async (method, table, body = null, params = {}) => {
  const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url, {
    method,
    headers: {
      apikey: SUPABASE_ANON,
      Authorization: `Bearer ${SUPABASE_ANON}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.status === 204 ? null : res.json();
};

const sbGet    = (table, params)       => sb("GET",   table, null, params);
const sbPatch  = (table, body, params) => sb("PATCH", table, body, params);

// ── Realtime subscription (Supabase WebSocket) ────────────────────────────────
function useRealtime(onChange) {
  useEffect(() => {
    const WS_URL = `wss://${SUPABASE_URL.replace("https://", "")}/realtime/v1/websocket?apikey=${SUPABASE_ANON}&vsn=1.0.0`;
    const TABLES  = ["stops", "routes", "pickup_orders"];
    let ws        = null;
    let heartbeat = null;
    let ref       = 0;
    let dead      = false;

    const connect = () => {
      if (dead) return;
      ws = new WebSocket(WS_URL);

      ws.onopen = () => {
        TABLES.forEach(table => {
          ws.send(JSON.stringify({
            topic:   `realtime:public:${table}`,
            event:   "phx_join",
            payload: {
              config: {
                broadcast:        { self: false },
                presence:         { key: "" },
                postgres_changes: [{ event: "*", schema: "public", table }],
              },
            },
            ref: String(++ref),
          }));
        });

        heartbeat = setInterval(() => {
          if (ws?.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
              topic: "phoenix", event: "heartbeat", payload: {}, ref: String(++ref),
            }));
          }
        }, 25000);
      };

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.event === "postgres_changes") onChange();
        } catch { /* ignore */ }
      };

      ws.onclose = () => {
        clearInterval(heartbeat);
        if (!dead) setTimeout(connect, 3000);
      };

      ws.onerror = () => ws.close();
    };

    connect();

    return () => {
      dead = true;
      clearInterval(heartbeat);
      ws?.close();
    };
  }, [onChange]);
}

// ── Live clock hook (ticks every 30s) ────────────────────────────────────────
function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);
  return now;
}

// ── Timing helpers ────────────────────────────────────────────────────────────
const fmtDuration = (minutes) => {
  if (!minutes || !isFinite(minutes) || minutes < 0) return "—";
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
};

const fmtTime = (isoString) => {
  if (!isoString) return "—";
  return new Date(isoString).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
};

// ── Styles ────────────────────────────────────────────────────────────────────
const css = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=DM+Mono:wght@400;500&display=swap');
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'DM Sans',sans-serif;background:#f4f6f8;color:#111827;-webkit-font-smoothing:antialiased}
  ::-webkit-scrollbar{width:4px;height:4px}
  ::-webkit-scrollbar-thumb{background:#d1d5db;border-radius:2px}
  button{cursor:pointer;font-family:'DM Sans',sans-serif;-webkit-appearance:none;appearance:none}
  input{font-family:'DM Sans',sans-serif}
  a{color:inherit;text-decoration:none}
`;

// ── Constants ─────────────────────────────────────────────────────────────────
const SHIFTS  = ["Shift 1 (7:30am)", "Shift 2 (10:30am)", "Shift 3 (1:30pm)"];
const SHIFT_COLORS = ["#1a6b3a", "#2563eb", "#7c3aed"];

// ── Utility ───────────────────────────────────────────────────────────────────
const statusColor = (s) => ({
  unassigned:  "#6b7280",
  assigned:    "#2563eb",
  in_progress: "#d97706",
  complete:    "#16a34a",
  pending:     "#6b7280",
  delivered:   "#16a34a",
  skipped:     "#dc2626",
}[s] || "#6b7280");

const statusLabel = (s) => ({
  unassigned:  "Unassigned",
  assigned:    "Assigned",
  in_progress: "In Progress",
  complete:    "Complete",
  pending:     "Pending",
  delivered:   "✓ Delivered",
  skipped:     "Skipped",
}[s] || s);

const mapsUrl = (address) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
const wazeUrl = (lat, lng) =>
  `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`;
const appleMapsUrl = (address) =>
  `maps://maps.apple.com/?q=${encodeURIComponent(address)}`;
const DEPOT_ADDRESS = "11135 Newport Mill Rd, Kensington, MD 20895";
const fullRouteUrl = (stops) => {
  if (!stops?.length) return "#";
  const origin = encodeURIComponent(DEPOT_ADDRESS);
  const dest   = encodeURIComponent(DEPOT_ADDRESS);
  const waypts = stops.map(s => encodeURIComponent(s.address)).join("|");
  return `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${dest}${waypts ? `&waypoints=${waypts}` : ""}`;
};

// ── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [view, setView]         = useState("login");
  const [driverRoute, setDriverRoute] = useState(null);
  const [driverPin, setDriverPin]     = useState("");
  const [pinError, setPinError]       = useState("");
  const [routes, setRoutes]     = useState([]);
  const [pickups, setPickups]   = useState([]);
  const [allStops, setAllStops] = useState([]);
  const [loading, setLoading]   = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const routeId = params.get("route");
    if (routeId) {
      setView("driver_loading");
      loadDriverRoute(routeId);
    }
  }, []);

  const loadDriverRoute = async (routeId) => {
    try {
      const [routeArr, stops] = await Promise.all([
        sbGet("routes", { select: "*", id: `eq.${routeId}` }),
        sbGet("stops",  { select: "*", route_id: `eq.${routeId}`, order: "stop_num.asc" }),
      ]);
      if (routeArr?.length) {
        setDriverRoute({ ...routeArr[0], stops: stops || [] });
        setView("driver");
      }
    } catch(e) {
      console.error(e);
      setView("login");
    }
  };

  const loadManagerData = useCallback(async () => {
    try {
      const [r, p, s] = await Promise.all([
        sbGet("routes",        { select: "*", order: "shift_num.asc" }),
        sbGet("pickup_orders", { select: "*", order: "name.asc" }),
        sbGet("stops",         { select: "route_id,status,bags" }),
      ]);
      const parseVehicle = (v = "") => {
        const m = v.match(/(\d+)[^\d]+(\d+)/);
        return m ? [parseInt(m[1]), parseInt(m[2])] : [0, 0];
      };
      const sorted = (r || []).sort((a, b) => {
        if (a.shift_num !== b.shift_num) return a.shift_num - b.shift_num;
        const [at, atr] = parseVehicle(a.vehicle);
        const [bt, btr] = parseVehicle(b.vehicle);
        return at !== bt ? at - bt : atr - btr;
      });
      setRoutes(sorted);
      setPickups(p || []);
      setAllStops(s || []);
    } catch(e) { console.error(e); }
  }, []);

  useRealtime(loadManagerData);

  useEffect(() => {
    if (view === "manager") loadManagerData();
  }, [view, loadManagerData]);

  const handleManagerLogin = (pin) => {
    if (pin === "2026") { setView("manager"); setPinError(""); }
    else setPinError("Incorrect PIN");
  };

  if (view === "login" || view === "driver_loading") {
    return <LoginScreen
      onManager={handleManagerLogin}
      pinError={pinError}
      loading={view === "driver_loading"}
    />;
  }
  if (view === "driver" && driverRoute) {
    return <DriverView route={driverRoute} onReload={() => loadDriverRoute(driverRoute.id)} />;
  }
  return <ManagerDashboard
    routes={routes}
    pickups={pickups}
    allStops={allStops}
    onReload={loadManagerData}
    loading={loading}
  />;
}

// ── Login Screen ──────────────────────────────────────────────────────────────
function LoginScreen({ onManager, pinError, loading }) {
  const [pin, setPin] = useState("");

  return (
    <div style={{ minHeight:"100vh", background:"linear-gradient(135deg,#1a3a2a 0%,#2d6e3a 100%)",
                  display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
      <style>{css}</style>
      <div style={{ background:"#fff", borderRadius:16, padding:40, width:"100%", maxWidth:360,
                    boxShadow:"0 20px 60px rgba(0,0,0,.3)", textAlign:"center" }}>
        <div style={{ fontSize:48, marginBottom:12 }}>🌿</div>
        <h1 style={{ fontSize:22, fontWeight:700, color:"#1a3a2a", marginBottom:4 }}>AEHS Mulch 2026</h1>
        <p style={{ color:"#6b7280", fontSize:14, marginBottom:32 }}>Delivery Management</p>

        {loading ? (
          <p style={{ color:"#6b7280" }}>Loading your route...</p>
        ) : (
          <>
            <div style={{ background:"#f9fafb", borderRadius:10, padding:20, marginBottom:16, textAlign:"left" }}>
              <p style={{ fontSize:12, fontWeight:600, color:"#6b7280", marginBottom:8, letterSpacing:.5, textTransform:"uppercase" }}>Manager Access</p>
              <input
                type="password" placeholder="Enter PIN" value={pin}
                onChange={e => setPin(e.target.value)}
                onKeyDown={e => e.key === "Enter" && onManager(pin)}
                style={{ width:"100%", height:42, padding:"0 12px", border:"1px solid #e5e7eb",
                         borderRadius:8, fontSize:16, outline:"none", letterSpacing:4, marginBottom:8 }}
              />
              {pinError && <p style={{ color:"#dc2626", fontSize:12 }}>{pinError}</p>}
              <button onClick={() => onManager(pin)}
                style={{ width:"100%", height:42, background:"#1a3a2a", color:"#fff",
                         border:"none", borderRadius:8, fontWeight:600, fontSize:14 }}>
                Open Dashboard
              </button>
            </div>
            <p style={{ fontSize:12, color:"#9ca3af" }}>Drivers: scan your QR code to access your route</p>
          </>
        )}
      </div>
    </div>
  );
}

// ── Print Route Sheets ────────────────────────────────────────────────────────
function openPrintWindow(routesList, stopsMatrix, appUrl) {
  const depot = "11135 Newport Mill Rd, Kensington, MD 20895";

  const parseVehicle = (v = "") => {
    const m = v.match(/(\d+)[^\d]+(\d+)/);
    return m ? [parseInt(m[1]), parseInt(m[2])] : [0, 0];
  };
  const order = routesList
    .map((r, i) => ({ r, i }))
    .sort((a, b) => {
      const [at, atr] = parseVehicle(a.r.vehicle);
      const [bt, btr] = parseVehicle(b.r.vehicle);
      return at !== bt ? at - bt : atr - btr;
    });
  const sortedRoutes = order.map(o => o.r);
  const sortedStops  = order.map(o => stopsMatrix[o.i]);

  const pages = sortedRoutes.map((r, i) => {
    const stops = sortedStops[i] || [];
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(appUrl(r.id))}`;
    const statsHtml = `<span>${r.total_stops} stops</span><span>${r.total_bags} bags</span>${r.total_miles ? `<span>${Number(r.total_miles).toFixed(1)} mi</span>` : ""}`;

    const rows = stops.map(s => `
      <tr>
        <td class="col-num">${s.stop_num}</td>
        <td class="col-customer">
          <strong>${s.name || ""}</strong><br/>
          ${(s.address || "").replace(/, USA$/, "")}<br/>
          ${s.phone ? `<span class="phone">&#9990; ${s.phone}</span>` : ""}
        </td>
        <td class="col-bags"><strong>${s.bags} bags</strong></td>
        <td class="col-instr">${s.instructions || "&#8212;"}</td>
      </tr>`).join("");

    return `
      <div class="page">
        <div class="page-header">
          <div class="header-text">
            <div class="event-label">AEHS BOOSTERS MULCH DELIVERY 2026</div>
            <div class="route-name">${r.vehicle}</div>
            <div class="shift-name">${r.shift}${r.driver_name ? ` &mdash; 👤 ${r.driver_name}` : " &mdash; <em>Unassigned</em>"}</div>
            <div class="stats">${statsHtml}</div>
          </div>
          <div class="header-qr">
            <img src="${qrUrl}" width="110" height="110" alt="QR"/>
            <div class="qr-caption">Scan for mobile route</div>
          </div>
        </div>
        <div class="depot-row">
          &#128205; <strong>AEHS:</strong> ${depot}
        </div>
        <table>
          <thead>
            <tr>
              <th class="col-num">#</th>
              <th class="col-customer">CUSTOMER / ADDRESS</th>
              <th class="col-bags">BAGS</th>
              <th class="col-instr">DELIVERY INSTRUCTIONS</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        <div class="keys-reminder">&#128273; Please Leave Keys in Vehicle</div>
        <div class="page-footer">
          <span>AEHS Boosters &middot; mulch-delivery-app.vercel.app</span>
          <span>${r.vehicle} &middot; ${r.shift}</span>
        </div>
      </div>`;
  }).join("");

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>Route Sheets &mdash; ${routesList[0]?.shift || ""}</title>
  <style>
    @page { size: letter; margin: 0.65in 0.75in; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #111; }
    .page { page-break-after: always; display: flex; flex-direction: column; min-height: 9.5in; }
    .page:last-child { page-break-after: avoid; }
    .page-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 14px; }
    .event-label { font-size: 8.5px; font-weight: 700; color: #1a6b3a; letter-spacing: 1.5px; text-transform: uppercase; margin-bottom: 4px; }
    .route-name { font-size: 30px; font-weight: 900; line-height: 1.1; margin-bottom: 2px; }
    .shift-name { font-size: 12px; color: #555; margin-bottom: 8px; }
    .stats span { font-size: 11px; border: 1px solid #ccc; border-radius: 12px; padding: 2px 10px; margin-right: 6px; color: #333; }
    .header-qr { text-align: center; flex-shrink: 0; }
    .qr-caption { font-size: 9px; color: #666; margin-top: 4px; }
    .depot-row { background: #fffde7; border: 1px solid #ffe082; border-radius: 6px;
                 padding: 7px 12px; margin-bottom: 12px; font-size: 11px; color: #5a3e00; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; }
    thead tr { background: #f5f5f5; }
    th { padding: 6px 8px; text-align: left; font-size: 9px; font-weight: 700; color: #888;
         text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #ddd; }
    td { padding: 10px 8px; border-bottom: 1px solid #ebebeb; vertical-align: top; line-height: 1.5; }
    tr:nth-child(even) td { background: #fafafa; }
    .col-num  { width: 28px; text-align: center; font-weight: 700; }
    .col-customer { width: 36%; }
    .col-bags { width: 80px; color: #1a6b3a; }
    .col-instr { color: #333; }
    .phone { color: #555; font-size: 10px; }
    .keys-reminder { margin-top: 14px; text-align: center; color: #cc0000; font-weight: 700;
                     font-size: 14px; letter-spacing: 0.5px; }
    .page-footer { margin-top: auto; padding-top: 10px; border-top: 1px solid #ddd;
                   display: flex; justify-content: space-between; font-size: 9px; color: #aaa; }
  </style>
</head>
<body>${pages}</body>
</html>`;

  const w = window.open("", "_blank");
  if (!w) { alert("Pop-up blocked — please allow pop-ups for this site."); return; }
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 800);
}

// ── Manager Dashboard ─────────────────────────────────────────────────────────
function ManagerDashboard({ routes, pickups, allStops, onReload, loading }) {
  const [activeShift, setActiveShift] = useState(0);
  const [activeTab,   setActiveTab]   = useState("routes");
  const [editingRoute, setEditingRoute] = useState(null);
  const [driverName, setDriverName]     = useState("");
  const [saving, setSaving]             = useState(false);
  const [qrRoute, setQrRoute]           = useState(null);
  const [printing, setPrinting]         = useState(false);

  const now = useNow();

  const shiftRoutes = routes.filter(r => r.shift_num === activeShift + 1);

  const stopsByRoute = allStops.reduce((acc, s) => {
    if (!acc[s.route_id]) acc[s.route_id] = [];
    acc[s.route_id].push(s);
    return acc;
  }, {});

  // Stats — Totals
  const deliveryBags    = routes.reduce((a, r) => a + r.total_bags, 0);
  const pickupBags      = pickups.reduce((a, p) => a + (p.bags || 0), 0);
  const totalBags       = deliveryBags + pickupBags;
  const totalStops      = routes.reduce((a, r) => a + r.total_stops, 0);
  const assigned        = routes.filter(r => r.status !== "unassigned").length;
  const completed       = routes.filter(r => r.status === "complete").length;
  const totalHouseholds = totalStops + pickups.length;
  const totalMiles      = routes.reduce((a, r) => a + (r.total_miles || 0), 0);

  // Stats — Progress
  const deliveredStops  = allStops.filter(s => s.status === "delivered" || s.status === "skipped");
  const doneStops       = deliveredStops.length;
  const doneBags        = allStops.filter(s => s.status === "delivered").reduce((a, s) => a + (s.bags || 0), 0)
                        + pickups.filter(p => p.checked_out).reduce((a, p) => a + (p.bags || 0), 0);
  const donePickups     = pickups.filter(p => p.checked_out).length;
  const doneHouseholds  = doneStops + donePickups;
  const doneRoutes      = routes.filter(r => r.status === "complete");
  const doneMiles       = doneRoutes.reduce((a, r) => a + (r.total_miles || 0), 0);

  // ── Global timing ──────────────────────────────────────────────────────────
  const startedRoutes = routes.filter(r => r.started_at);
  const firstStartedAt = startedRoutes.length
    ? new Date(Math.min(...startedRoutes.map(r => new Date(r.started_at).getTime())))
    : null;

  const globalElapsedMin = firstStartedAt ? (now - firstStartedAt.getTime()) / 60000 : 0;
  const globalRate = globalElapsedMin > 0 && doneStops > 0
    ? doneStops / globalElapsedMin   // stops per minute
    : 0;
  const globalEstTotalMin = globalRate > 0 ? totalHouseholds / globalRate : 0;
  const globalEstRemainingMin = globalRate > 0
    ? Math.max(0, (totalHouseholds - doneHouseholds) / globalRate)
    : 0;

  const [resetting, setResetting] = useState(false);

  const resetAll = async () => {
    if (!window.confirm("⚠️ Reset ALL routes and stops to unassigned/pending? This cannot be undone.")) return;
    setResetting(true);
    try {
      await sbPatch("routes", { status: "unassigned", completed_at: null, started_at: null, driver_name: null },
                    { id: "neq.00000000-0000-0000-0000-000000000000" });
      await sbPatch("stops",  { status: "pending", completed_at: null, driver_note: null },
                    { id: "neq.00000000-0000-0000-0000-000000000000" });
      await sbPatch("pickup_orders", { checked_out: false, checked_out_at: null, checked_out_by: null },
                    { id: "neq.00000000-0000-0000-0000-000000000000" });
      onReload();
    } catch(e) { console.error(e); }
    setResetting(false);
  };

  const markRouteComplete = async (routeId) => {
    try {
      await sbPatch("routes", { status: "complete", completed_at: new Date().toISOString() },
                    { id: `eq.${routeId}` });
      await sbPatch("stops", { status: "delivered", completed_at: new Date().toISOString() },
                    { route_id: `eq.${routeId}`, status: "neq.skipped" });
      onReload();
    } catch(e) { console.error(e); }
  };

  const resetRoute = async (routeId) => {
    try {
      await sbPatch("routes", { status: "unassigned", completed_at: null, started_at: null, driver_name: null },
                    { id: `eq.${routeId}` });
      await sbPatch("stops",  { status: "pending", completed_at: null, driver_note: null },
                    { route_id: `eq.${routeId}` });
      onReload();
    } catch(e) { console.error(e); }
  };

  const assignDriver = async () => {
    if (!editingRoute || !driverName.trim()) return;
    setSaving(true);
    try {
      await sbPatch("routes", { driver_name: driverName, status: "assigned" },
                    { id: `eq.${editingRoute}` });
      setEditingRoute(null); setDriverName("");
      onReload();
    } catch(e) { console.error(e); }
    setSaving(false);
  };

  const showQr = (route) => setQrRoute(route);
  const appUrl = (routeId) => `${window.location.origin}?route=${routeId}`;

  const printSingleRoute = async (route) => {
    try {
      const stops = await sbGet("stops", { select:"*", route_id:`eq.${route.id}`, order:"stop_num.asc" });
      openPrintWindow([route], [stops || []], appUrl);
    } catch(e) { console.error(e); }
  };

  const printShiftRoutes = async () => {
    setPrinting(true);
    try {
      const shiftRts = routes.filter(r => r.shift_num === activeShift + 1);
      const stopsArr = await Promise.all(
        shiftRts.map(r => sbGet("stops", { select:"*", route_id:`eq.${r.id}`, order:"stop_num.asc" }))
      );
      openPrintWindow(shiftRts, stopsArr.map(s => s || []), appUrl);
    } catch(e) { console.error(e); }
    setPrinting(false);
  };

  return (
    <div style={{ minHeight:"100vh", display:"flex", flexDirection:"column" }}>
      <style>{css}</style>

      {/* Header */}
      <header style={{ background:"#1a3a2a", padding:"10px 20px",
                       position:"sticky", top:0, zIndex:100 }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 }}>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <span style={{ fontSize:22 }}>🌿</span>
            <span style={{ color:"#fff", fontWeight:700, fontSize:15 }}>AEHS Mulch <span style={{ color:"#4ade80" }}>Manager</span></span>
          </div>
          <div style={{ display:"flex", gap:6 }}>
            <button onClick={onReload}
              style={{ background:"rgba(255,255,255,.1)", border:"1px solid rgba(255,255,255,.2)",
                       color:"#fff", borderRadius:6, padding:"4px 10px", fontSize:12 }}>↻</button>
            <button onClick={resetAll} disabled={resetting}
              style={{ background:"rgba(220,38,38,.25)", border:"1px solid rgba(220,38,38,.5)",
                       color:"#fca5a5", borderRadius:6, padding:"4px 10px", fontSize:12, fontWeight:600 }}>
              {resetting ? "…" : "⚠️ Reset"}
            </button>
          </div>
        </div>

        {/* Two-row stats table */}
        <div style={{ display:"grid", gridTemplateColumns:"auto repeat(6,1fr)", gap:"0 2px",
                      fontFamily:"'DM Mono',monospace", fontSize:11 }}>
          <div style={{ color:"rgba(255,255,255,.4)", fontSize:10, display:"flex", flexDirection:"column", gap:2, paddingRight:8 }}>
            <div style={{ height:36, display:"flex", alignItems:"center", fontWeight:600, letterSpacing:.5 }}>TOTAL</div>
            <div style={{ height:36, display:"flex", alignItems:"center", fontWeight:600, letterSpacing:.5 }}>DONE</div>
          </div>

          {[
            ["Bags",       totalBags.toLocaleString(),                    doneBags.toLocaleString()],
            ["Households", totalHouseholds,                               doneHouseholds],
            ["Stops",      totalStops,                                    doneStops],
            ["Routes",     routes.length,                                 completed],
            ["Miles",      totalMiles ? totalMiles.toFixed(0) : "—",     doneMiles.toFixed(0)],
            ["Assigned",   `${assigned}/${routes.length}`,                null],
          ].map(([label, total, done]) => {
            const pct = done !== null && parseFloat(String(total).replace(/,/g,"")) > 0
              ? Math.round(parseFloat(String(done).replace(/,/g,"")) / parseFloat(String(total).replace(/,/g,"")) * 100)
              : 0;
            return (
              <div key={label} style={{ background:"rgba(255,255,255,.07)", borderRadius:6, padding:"4px 8px", textAlign:"center" }}>
                <div style={{ color:"rgba(255,255,255,.5)", fontSize:9, letterSpacing:.5, textTransform:"uppercase", marginBottom:2 }}>{label}</div>
                <div style={{ height:30, display:"flex", alignItems:"center", justifyContent:"center" }}>
                  <span style={{ color:"#fff", fontWeight:700, fontSize:15 }}>{total}</span>
                </div>
                {done !== null ? (
                  <>
                    <div style={{ height:2, background:"rgba(255,255,255,.15)", borderRadius:1, margin:"2px 0 4px" }}>
                      <div style={{ height:"100%", background:"#4ade80", borderRadius:1, width:`${pct}%`, transition:"width .4s" }} />
                    </div>
                    <div style={{ height:24, display:"flex", alignItems:"center", justifyContent:"center" }}>
                      <span style={{ color:"#4ade80", fontWeight:600, fontSize:13 }}>{done}</span>
                    </div>
                  </>
                ) : (
                  <div style={{ height:30 }} />
                )}
              </div>
            );
          })}
        </div>

        {/* Global timing bar */}
        {firstStartedAt ? (
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:4, marginTop:6 }}>
            {[
              ["🕐 Started",   fmtTime(firstStartedAt.toISOString()),  "#93c5fd"],
              ["⏱ Elapsed",    fmtDuration(globalElapsedMin),           "#fbbf24"],
              ["⏳ Est Remaining", fmtDuration(globalEstRemainingMin),  globalEstRemainingMin < 30 ? "#4ade80" : "#f87171"],
            ].map(([label, value, color]) => (
              <div key={label} style={{ background:"rgba(255,255,255,.08)", borderRadius:6,
                                        padding:"5px 8px", textAlign:"center" }}>
                <div style={{ color:"rgba(255,255,255,.45)", fontSize:9, letterSpacing:.4,
                               textTransform:"uppercase", marginBottom:2 }}>{label}</div>
                <div style={{ color, fontWeight:700, fontSize:13,
                               fontFamily:"'DM Mono',monospace" }}>{value}</div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ marginTop:6, padding:"6px 10px", background:"rgba(255,255,255,.05)",
                        borderRadius:6, textAlign:"center" }}>
            <span style={{ color:"rgba(255,255,255,.35)", fontSize:11 }}>
              ⏱ Timing starts when first delivery is marked
            </span>
          </div>
        )}

        {/* Global est total (shown separately once we have a rate) */}
        {globalEstTotalMin > 0 && (
          <div style={{ marginTop:4, textAlign:"center" }}>
            <span style={{ color:"rgba(255,255,255,.4)", fontSize:10 }}>
              Est total operation: <span style={{ color:"rgba(255,255,255,.7)", fontWeight:600 }}>
                {fmtDuration(globalEstTotalMin)}
              </span>
              {" · "}Est finish: <span style={{ color:"rgba(255,255,255,.7)", fontWeight:600 }}>
                {fmtTime(new Date(firstStartedAt.getTime() + globalEstTotalMin * 60000).toISOString())}
              </span>
            </span>
          </div>
        )}
      </header>

      {/* Tabs */}
      <div style={{ background:"#fff", borderBottom:"1px solid #e5e7eb",
                    display:"flex", padding:"0 20px", gap:4 }}>
        {[["routes","🚛 Routes"],["pickups","🏠 Pickups"],["qr","📱 QR Codes"]].map(([k,l]) => (
          <button key={k} onClick={() => setActiveTab(k)}
            style={{ padding:"12px 16px", border:"none", background:"none", fontSize:13,
                     fontWeight: activeTab===k ? 700 : 400,
                     color: activeTab===k ? "#1a3a2a" : "#6b7280",
                     borderBottom: activeTab===k ? "2px solid #1a3a2a" : "2px solid transparent" }}>
            {l}
          </button>
        ))}
      </div>

      <div style={{ flex:1, overflow:"auto", padding:16 }}>

        {/* QR tab */}
        {activeTab === "qr" && (
          <div>
            <p style={{ color:"#6b7280", fontSize:13, marginBottom:16 }}>
              Each QR code links directly to that vehicle's route. Print and hand to drivers.
            </p>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))", gap:12 }}>
              {routes.map(r => (
                <div key={r.id} style={{ background:"#fff", border:"1px solid #e5e7eb",
                                         borderRadius:10, padding:16, textAlign:"center" }}>
                  <p style={{ fontWeight:700, fontSize:13, marginBottom:4 }}>{r.vehicle}</p>
                  <p style={{ fontSize:11, color:"#6b7280", marginBottom:10 }}>{r.shift}</p>
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(appUrl(r.id))}`}
                    alt="QR" style={{ width:150, height:150, borderRadius:6 }}
                  />
                  <p style={{ fontSize:10, color:"#9ca3af", marginTop:8, wordBreak:"break-all" }}>
                    {r.driver_name || "Unassigned"}
                  </p>
                  <a href={appUrl(r.id)} target="_blank" rel="noreferrer"
                    style={{ display:"block", marginTop:8, fontSize:11, color:"#2563eb" }}>
                    Open Route →
                  </a>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Pickups tab */}
        {activeTab === "pickups" && (
          <div style={{ background:"#fff", borderRadius:10, border:"1px solid #e5e7eb", overflow:"hidden" }}>
            <div style={{ background:"#1a3a2a", padding:"10px 16px", color:"#fff", fontWeight:700, fontSize:14 }}>
              🏠 Pickup Orders — AEHS: 11135 Newport Mill Rd, Kensington MD
            </div>
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
              <thead>
                <tr style={{ background:"#f9fafb" }}>
                  {["Name","Phone","Email","Bags","Status","Action"].map(h => (
                    <th key={h} style={{ padding:"8px 12px", textAlign:"left", fontSize:11,
                                         fontWeight:700, color:"#6b7280", textTransform:"uppercase",
                                         letterSpacing:.5, borderBottom:"1px solid #e5e7eb" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pickups.map(p => (
                  <tr key={p.id} style={{ background: p.checked_out ? "#f0fdf4" : "#fff" }}>
                    <td style={{ padding:"10px 12px", fontWeight:600, borderBottom:"1px solid #f3f4f6" }}>{p.name}</td>
                    <td style={{ padding:"10px 12px", borderBottom:"1px solid #f3f4f6" }}>{p.phone || "—"}</td>
                    <td style={{ padding:"10px 12px", borderBottom:"1px solid #f3f4f6" }}>
                      <a href={`mailto:${p.email}`} style={{ color:"#2563eb" }}>{p.email}</a>
                    </td>
                    <td style={{ padding:"10px 12px", fontFamily:"'DM Mono',monospace", fontWeight:600,
                                  color:"#1a3a2a", borderBottom:"1px solid #f3f4f6" }}>{p.bags}</td>
                    <td style={{ padding:"10px 12px", borderBottom:"1px solid #f3f4f6" }}>
                      <span style={{ background: p.checked_out ? "#dcfce7" : "#f3f4f6",
                                     color: p.checked_out ? "#16a34a" : "#6b7280",
                                     padding:"2px 8px", borderRadius:10, fontSize:11, fontWeight:600 }}>
                        {p.checked_out ? "✓ Picked Up" : "Waiting"}
                      </span>
                    </td>
                    <td style={{ padding:"10px 12px", borderBottom:"1px solid #f3f4f6" }}>
                      <div style={{ display:"flex", gap:6 }}>
                        {!p.checked_out ? (
                          <button onClick={async () => {
                              await sbPatch("pickup_orders",
                                { checked_out: true, checked_out_at: new Date().toISOString(), checked_out_by: "Manager" },
                                { id: `eq.${p.id}` });
                              onReload();
                            }}
                            style={{ background:"#1a3a2a", color:"#fff", border:"none",
                                     borderRadius:6, padding:"4px 10px", fontSize:12, fontWeight:600 }}>
                            Mark Picked Up
                          </button>
                        ) : (
                          <button onClick={async () => {
                              if (!window.confirm(`Reset pickup for ${p.name}?`)) return;
                              await sbPatch("pickup_orders",
                                { checked_out: false, checked_out_at: null, checked_out_by: null },
                                { id: `eq.${p.id}` });
                              onReload();
                            }}
                            style={{ background:"#fee2e2", color:"#dc2626", border:"1px solid #fca5a5",
                                     borderRadius:6, padding:"4px 10px", fontSize:12, fontWeight:600 }}>
                            ↺ Reset
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Routes tab */}
        {activeTab === "routes" && (
          <>
            {/* Shift tabs + print button */}
            <div style={{ display:"flex", gap:8, marginBottom:16, alignItems:"stretch" }}>
              {SHIFTS.map((s, i) => {
                const sr = routes.filter(r => r.shift_num === i+1);
                const done = sr.filter(r => r.status === "complete").length;
                return (
                  <button key={i} onClick={() => setActiveShift(i)}
                    style={{ flex:1, padding:"10px 8px", border:"2px solid",
                             borderColor: activeShift===i ? SHIFT_COLORS[i] : "#e5e7eb",
                             borderRadius:10, background: activeShift===i ? SHIFT_COLORS[i] : "#fff",
                             color: activeShift===i ? "#fff" : "#374151",
                             fontWeight:600, fontSize:13, transition:"all .15s" }}>
                    <div>{s.split(" ")[0]} {s.split(" ")[1]}</div>
                    <div style={{ fontSize:11, opacity:.8, fontWeight:400, marginTop:2 }}>
                      {sr.length} routes · {done} done
                    </div>
                  </button>
                );
              })}
              <button onClick={printShiftRoutes} disabled={printing}
                style={{ padding:"10px 14px", border:`2px solid ${SHIFT_COLORS[activeShift]}`, borderRadius:10,
                         background: printing ? "#e5e7eb" : SHIFT_COLORS[activeShift], color:"#fff",
                         fontWeight:600, fontSize:13, cursor: printing ? "default" : "pointer",
                         whiteSpace:"nowrap", flexShrink:0 }}>
                {printing ? "⏳ Loading…" : `🖨️ Print Shift ${activeShift + 1}`}
              </button>
            </div>

            {/* Route cards */}
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))", gap:12 }}>
              {shiftRoutes.map(r => (
                <RouteCard key={r.id} route={r}
                  liveStops={stopsByRoute[r.id] || []}
                  now={now}
                  onAssign={() => { setEditingRoute(r.id); setDriverName(r.driver_name || ""); }}
                  onQr={() => showQr(r)}
                  onPrint={() => printSingleRoute(r)}
                  onMarkComplete={() => markRouteComplete(r.id)}
                  onResetRoute={() => resetRoute(r.id)}
                  appUrl={appUrl(r.id)}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {/* QR Code modal */}
      {qrRoute && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.6)", zIndex:200,
                      display:"flex", alignItems:"center", justifyContent:"center" }}
             onClick={() => setQrRoute(null)}>
          <div onClick={e => e.stopPropagation()}
               style={{ background:"#fff", borderRadius:16, padding:32, width:300,
                        textAlign:"center", boxShadow:"0 20px 60px rgba(0,0,0,.3)" }}>
            <div style={{ fontWeight:700, fontSize:16, marginBottom:4 }}>{qrRoute.vehicle}</div>
            <div style={{ fontSize:12, color:"#6b7280", marginBottom:20 }}>{qrRoute.shift}</div>
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(appUrl(qrRoute.id))}`}
              alt="QR Code" style={{ width:200, height:200, borderRadius:8, marginBottom:16 }}
            />
            <a href={appUrl(qrRoute.id)} target="_blank" rel="noreferrer"
               style={{ display:"block", fontSize:11, color:"#2563eb", marginBottom:20,
                        wordBreak:"break-all", textDecoration:"underline" }}>
              {appUrl(qrRoute.id)}
            </a>
            <button onClick={() => setQrRoute(null)}
              style={{ width:"100%", height:40, background:"#1a3a2a", color:"#fff",
                       border:"none", borderRadius:8, fontSize:14, fontWeight:600 }}>
              Close
            </button>
          </div>
        </div>
      )}
      {editingRoute && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.5)", zIndex:200,
                      display:"flex", alignItems:"center", justifyContent:"center" }}
             onClick={() => setEditingRoute(null)}>
          <div onClick={e => e.stopPropagation()}
               style={{ background:"#fff", borderRadius:14, padding:28, width:320,
                        boxShadow:"0 20px 60px rgba(0,0,0,.3)" }}>
            <h3 style={{ marginBottom:16, fontSize:16 }}>Assign Driver</h3>
            <input value={driverName} onChange={e => setDriverName(e.target.value)}
              placeholder="Driver name"
              style={{ width:"100%", height:42, padding:"0 12px", border:"1px solid #e5e7eb",
                       borderRadius:8, fontSize:14, outline:"none", marginBottom:12 }} />
            <div style={{ display:"flex", gap:8 }}>
              <button onClick={() => setEditingRoute(null)}
                style={{ flex:1, height:40, border:"1px solid #e5e7eb", borderRadius:8,
                         background:"#fff", fontSize:14 }}>Cancel</button>
              <button onClick={assignDriver} disabled={saving}
                style={{ flex:1, height:40, background:"#1a3a2a", color:"#fff",
                         border:"none", borderRadius:8, fontSize:14, fontWeight:600 }}>
                {saving ? "Saving..." : "Assign"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Route Card ────────────────────────────────────────────────────────────────
function RouteCard({ route, liveStops, now, onAssign, onQr, onPrint, onMarkComplete, onResetRoute, appUrl }) {
  const [expanded, setExpanded] = useState(false);
  const [stops, setStops]       = useState([]);
  const [completing, setCompleting] = useState(false);
  const [resetting, setResetting]   = useState(false);

  // Live progress from parent-supplied stop statuses
  const liveDelivered = liveStops.filter(s => s.status === "delivered" || s.status === "skipped").length;
  const liveTotal     = liveStops.length || route.total_stops;
  const liveProgress  = liveTotal > 0 ? Math.round(liveDelivered / liveTotal * 100) : 0;
  const isActive      = liveDelivered > 0 && liveDelivered < liveTotal;

  // ── Per-route timing ──────────────────────────────────────────────────────
  const startedAt     = route.started_at ? new Date(route.started_at) : null;
  const elapsedMin    = startedAt ? (now - startedAt.getTime()) / 60000 : 0;
  const rate          = elapsedMin > 0 && liveDelivered > 0 ? liveDelivered / elapsedMin : 0; // stops/min
  const estTotalMin   = rate > 0 ? liveTotal / rate : 0;
  const estRemMin     = rate > 0 ? Math.max(0, (liveTotal - liveDelivered) / rate) : 0;
  const estFinishTime = startedAt && estTotalMin > 0
    ? new Date(startedAt.getTime() + estTotalMin * 60000)
    : null;

  const loadStops = async () => {
    if (!expanded) {
      const s = await sbGet("stops", { select:"*", route_id:`eq.${route.id}`, order:"stop_num.asc" });
      setStops(s || []);
    }
    setExpanded(e => !e);
  };

  const handleMarkComplete = async () => {
    if (!window.confirm(`Mark ${route.vehicle} as complete? This will mark all stops delivered.`)) return;
    setCompleting(true);
    await onMarkComplete();
    setCompleting(false);
  };

  const handleReset = async () => {
    if (!window.confirm(`Reset ${route.vehicle}? This will clear the driver and mark all stops pending.`)) return;
    setResetting(true);
    await onResetRoute();
    setStops([]);
    setExpanded(false);
    setResetting(false);
  };

  return (
    <div style={{ background:"#fff", border:"1px solid #e5e7eb", borderRadius:10,
                  overflow:"hidden", boxShadow:"0 1px 3px rgba(0,0,0,.06)" }}>
      <div style={{ padding:"12px 14px" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:8 }}>
          <div>
            <div style={{ fontFamily:"'DM Mono',monospace", fontWeight:700, fontSize:13, color:"#111827" }}>
              {route.vehicle}
            </div>
            {route.driver_name && (
              <div style={{ fontSize:12, color:"#4b5563", marginTop:2 }}>👤 {route.driver_name}</div>
            )}
          </div>
          <span style={{ background: statusColor(route.status) + "20",
                         color: statusColor(route.status),
                         padding:"2px 8px", borderRadius:10, fontSize:11, fontWeight:700 }}>
            {statusLabel(route.status)}
          </span>
        </div>

        <div style={{ display:"flex", gap:8, marginBottom:10 }}>
          {[[route.total_stops, "stops"], [route.total_bags, "bags"]].map(([v,l]) => (
            <div key={l} style={{ background:"#f3f4f6", borderRadius:6, padding:"4px 8px",
                                   fontFamily:"'DM Mono',monospace", fontSize:12 }}>
              <strong>{v}</strong> {l}
            </div>
          ))}
        </div>

        {/* Always-visible live progress bar */}
        {liveTotal > 0 && (
          <div style={{ marginBottom: startedAt ? 6 : 10 }}>
            <div style={{ height:5, background:"#e5e7eb", borderRadius:3, marginBottom:4, overflow:"hidden" }}>
              <div style={{
                height:"100%", borderRadius:3, transition:"width .4s",
                background: liveProgress === 100 ? "#16a34a" : isActive ? "#f59e0b" : "#d1d5db",
                width:`${liveProgress}%`
              }} />
            </div>
            <div style={{ fontSize:11, color: liveProgress === 100 ? "#16a34a" : isActive ? "#d97706" : "#9ca3af",
                          fontWeight: liveDelivered > 0 ? 600 : 400 }}>
              {liveDelivered}/{liveTotal} stops done
              {liveProgress === 100 ? " ✓" : ""}
            </div>
          </div>
        )}

        {/* Per-route timing row */}
        {startedAt && liveDelivered > 0 && (
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:4, marginBottom:10 }}>
            <div style={{ background:"#f0fdf4", borderRadius:5, padding:"4px 6px", textAlign:"center" }}>
              <div style={{ fontSize:9, color:"#6b7280", textTransform:"uppercase", letterSpacing:.3 }}>Started</div>
              <div style={{ fontSize:11, fontWeight:700, color:"#1a3a2a", fontFamily:"'DM Mono',monospace" }}>
                {fmtTime(route.started_at)}
              </div>
            </div>
            <div style={{ background:"#fffbeb", borderRadius:5, padding:"4px 6px", textAlign:"center" }}>
              <div style={{ fontSize:9, color:"#6b7280", textTransform:"uppercase", letterSpacing:.3 }}>Elapsed</div>
              <div style={{ fontSize:11, fontWeight:700, color:"#92400e", fontFamily:"'DM Mono',monospace" }}>
                {fmtDuration(elapsedMin)}
              </div>
            </div>
            <div style={{ background: liveProgress === 100 ? "#f0fdf4" : "#fef2f2", borderRadius:5, padding:"4px 6px", textAlign:"center" }}>
              <div style={{ fontSize:9, color:"#6b7280", textTransform:"uppercase", letterSpacing:.3 }}>
                {liveProgress === 100 ? "Finished" : "Est Left"}
              </div>
              <div style={{ fontSize:11, fontWeight:700,
                             color: liveProgress === 100 ? "#16a34a" : "#dc2626",
                             fontFamily:"'DM Mono',monospace" }}>
                {liveProgress === 100
                  ? fmtTime(route.completed_at)
                  : estRemMin > 0 ? fmtDuration(estRemMin) : "—"}
              </div>
            </div>
          </div>
        )}

        {/* Est finish time (only when in progress with enough data) */}
        {startedAt && liveDelivered > 0 && liveProgress < 100 && estFinishTime && (
          <div style={{ marginBottom:10, fontSize:11, color:"#6b7280", textAlign:"center" }}>
            Est finish: <span style={{ fontWeight:600, color:"#374151" }}>{fmtTime(estFinishTime.toISOString())}</span>
            {" · "}Est total: <span style={{ fontWeight:600, color:"#374151" }}>{fmtDuration(estTotalMin)}</span>
          </div>
        )}

        <div style={{ display:"flex", gap:6 }}>
          <button onClick={onAssign}
            style={{ flex:1, height:32, background:"#1a6b3a", border:"none", borderRadius:6, fontSize:12, fontWeight:600, color:"#fff", cursor:"pointer", WebkitAppearance:"none" }}>
            {route.driver_name ? "✏️ Reassign" : "👤 Assign"}
          </button>
          <button onClick={loadStops}
            style={{ flex:1, height:32, background:"#2d8a56", border:"none", borderRadius:6, fontSize:12, fontWeight:600, color:"#fff", cursor:"pointer", WebkitAppearance:"none" }}>
            {expanded ? "▲ Collapse" : "▼ Stops"}
          </button>
          {route.status !== "complete" && (
            <button onClick={handleMarkComplete} disabled={completing}
              style={{ flex:1, height:32, background: completing ? "#9ca3af" : "#15803d", border:"none",
                       borderRadius:6, fontSize:12, fontWeight:600, color:"#fff", cursor:"pointer", WebkitAppearance:"none" }}
              title="Mark entire route complete">
              {completing ? "…" : "✓ Done"}
            </button>
          )}
          {route.status !== "unassigned" && (
            <button onClick={handleReset} disabled={resetting}
              style={{ height:32, width:32, background: resetting ? "#9ca3af" : "#fee2e2", border:"1px solid #fca5a5",
                       borderRadius:6, fontSize:13, cursor:"pointer", color:"#dc2626", WebkitAppearance:"none" }}
              title="Reset this route">
              {resetting ? "…" : "↺"}
            </button>
          )}
          <button onClick={onPrint}
            style={{ height:32, width:32, background:"#3aa86e", border:"none", borderRadius:6, fontSize:16, cursor:"pointer", color:"#fff", WebkitAppearance:"none", display:"flex", alignItems:"center", justifyContent:"center" }}
            title="Print route sheet">
            🖨️
          </button>
          <button onClick={onQr}
            style={{ height:32, width:32, background:"#52c98a", border:"none", borderRadius:6, cursor:"pointer", color:"#fff", WebkitAppearance:"none", display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:700, letterSpacing:0.5 }}
            title="Show QR code">
            QR
          </button>
        </div>
      </div>

      {expanded && (
        <div style={{ borderTop:"1px solid #f3f4f6", maxHeight:300, overflowY:"auto" }}>
          {stops.map(s => (
            <div key={s.id} style={{ padding:"8px 14px", borderBottom:"1px solid #f9fafb",
                                      background: s.status==="delivered" ? "#f0fdf4" : "#fff",
                                      display:"flex", gap:8, alignItems:"flex-start" }}>
              <div style={{ width:20, height:20, borderRadius:"50%", flexShrink:0,
                             background: s.status==="delivered" ? "#16a34a" : "#e5e7eb",
                             color: s.status==="delivered" ? "#fff" : "#6b7280",
                             display:"flex", alignItems:"center", justifyContent:"center",
                             fontSize:10, fontWeight:700, marginTop:1 }}>
                {s.stop_num}
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontWeight:600, fontSize:12, whiteSpace:"nowrap",
                               overflow:"hidden", textOverflow:"ellipsis" }}>{s.name}</div>
                <div style={{ fontSize:11, color:"#6b7280", whiteSpace:"nowrap",
                               overflow:"hidden", textOverflow:"ellipsis" }}>
                  {(s.address||"").replace(", USA","")}
                </div>
                {s.instructions && (
                  <div style={{ fontSize:10, color:"#d97706", marginTop:2, fontStyle:"italic" }}>
                    📋 {s.instructions.substring(0,70)}{s.instructions.length>70?"…":""}
                  </div>
                )}
              </div>
              <div style={{ fontFamily:"'DM Mono',monospace", fontSize:11, fontWeight:700,
                             color:"#1a3a2a", flexShrink:0 }}>{s.bags}bg</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Driver View ───────────────────────────────────────────────────────────────
function DriverView({ route, onReload }) {
  const [stops, setStops]       = useState(route.stops || []);
  const [activeStop, setActiveStop] = useState(null);
  const [note, setNote]         = useState("");
  const [saving, setSaving]     = useState(false);

  const delivered = stops.filter(s => s.status === "delivered").length;
  const progress  = stops.length ? Math.round(delivered / stops.length * 100) : 0;
  const nextStop  = stops.find(s => s.status === "pending");

  const markDelivered = async (stopId, status = "delivered") => {
    setSaving(true);
    try {
      await sbPatch("stops",
        { status, completed_at: new Date().toISOString(), driver_note: note || null },
        { id: `eq.${stopId}` });
      setStops(prev => prev.map(s =>
        s.id === stopId ? { ...s, status, driver_note: note || null } : s
      ));
      setActiveStop(null); setNote("");

      // Set started_at on first delivery regardless of assigned/unassigned state
      if (route.status !== "in_progress" && route.status !== "complete") {
        await sbPatch("routes", { status: "in_progress", started_at: new Date().toISOString() },
                      { id: `eq.${route.id}` });
        route.status = "in_progress"; // update local reference so complete check fires correctly
      }
      const updated = stops.map(s => s.id === stopId ? { ...s, status } : s);
      if (updated.every(s => s.status !== "pending")) {
        await sbPatch("routes", { status: "complete", completed_at: new Date().toISOString() },
                      { id: `eq.${route.id}` });
      }
    } catch(e) { console.error(e); }
    setSaving(false);
  };

  return (
    <div style={{ minHeight:"100vh", background:"#f4f6f8", maxWidth:480, margin:"0 auto" }}>
      <style>{css}</style>

      {/* Driver header */}
      <div style={{ background:"#1a3a2a", padding:"14px 16px", position:"sticky", top:0, zIndex:10 }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
          <div>
            <div style={{ color:"#4ade80", fontSize:11, fontWeight:600, letterSpacing:.5, textTransform:"uppercase" }}>
              {route.shift}
            </div>
            <div style={{ color:"#fff", fontWeight:700, fontSize:16 }}>{route.vehicle}</div>
            {route.driver_name && (
              <div style={{ color:"rgba(255,255,255,.6)", fontSize:12 }}>👤 {route.driver_name}</div>
            )}
          </div>
          <div style={{ textAlign:"right", fontFamily:"'DM Mono',monospace" }}>
            <div style={{ color:"#4ade80", fontSize:22, fontWeight:700 }}>{delivered}/{stops.length}</div>
            <div style={{ color:"rgba(255,255,255,.5)", fontSize:11 }}>stops done</div>
          </div>
        </div>

        {/* Progress bar */}
        <div style={{ height:6, background:"rgba(255,255,255,.15)", borderRadius:3 }}>
          <div style={{ height:"100%", background:"#4ade80", borderRadius:3,
                         width:`${progress}%`, transition:"width .4s" }} />
        </div>
        <div style={{ display:"flex", justifyContent:"space-between", marginTop:4 }}>
          <span style={{ color:"rgba(255,255,255,.5)", fontSize:11 }}>{progress}% complete</span>
          <span style={{ color:"rgba(255,255,255,.5)", fontSize:11 }}>{route.total_bags} bags total</span>
        </div>
      </div>

      {/* Open in Maps buttons */}
      <div style={{ padding:"10px 12px", background:"#fff", borderBottom:"1px solid #e5e7eb",
                    display:"flex", gap:8 }}>
        <a href={fullRouteUrl(stops)} target="_blank" rel="noreferrer"
           style={{ flex:1, height:36, background:"#4285f4", color:"#fff", border:"none",
                    borderRadius:8, fontSize:12, fontWeight:600, display:"flex",
                    alignItems:"center", justifyContent:"center", gap:6 }}>
          🗺️ Google Maps
        </a>
        {nextStop && (
          <a href={wazeUrl(nextStop.lat, nextStop.lng)} target="_blank" rel="noreferrer"
             style={{ flex:1, height:36, background:"#33ccff", color:"#fff", border:"none",
                      borderRadius:8, fontSize:12, fontWeight:600, display:"flex",
                      alignItems:"center", justifyContent:"center", gap:6 }}>
            🚗 Waze
          </a>
        )}
        {nextStop && (
          <a href={appleMapsUrl(nextStop.address)} target="_blank" rel="noreferrer"
             style={{ flex:1, height:36, background:"#555", color:"#fff", border:"none",
                      borderRadius:8, fontSize:12, fontWeight:600, display:"flex",
                      alignItems:"center", justifyContent:"center", gap:6 }}>
            🍎 Maps
          </a>
        )}
      </div>

      {/* Stop list */}
      <div style={{ padding:12, display:"flex", flexDirection:"column", gap:8 }}>
        {stops.map(stop => (
          <div key={stop.id}
               style={{ background:"#fff", borderRadius:12, border:"2px solid",
                        borderColor: stop.status==="delivered" ? "#bbf7d0"
                                   : stop.id === nextStop?.id ? "#1a3a2a" : "#e5e7eb",
                        overflow:"hidden", opacity: stop.status==="delivered" ? .7 : 1 }}>
            <div style={{ padding:"12px 14px" }}>
              <div style={{ display:"flex", gap:10, alignItems:"flex-start" }}>
                <div style={{ width:28, height:28, borderRadius:"50%", flexShrink:0,
                               background: stop.status==="delivered" ? "#16a34a"
                                          : stop.id === nextStop?.id ? "#1a3a2a" : "#e5e7eb",
                               color: stop.status==="delivered" || stop.id===nextStop?.id ? "#fff" : "#6b7280",
                               display:"flex", alignItems:"center", justifyContent:"center",
                               fontWeight:700, fontSize:13, fontFamily:"'DM Mono',monospace" }}>
                  {stop.status==="delivered" ? "✓" : stop.stop_num}
                </div>

                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontWeight:700, fontSize:14 }}>{stop.name}</div>
                  <div style={{ fontSize:12, color:"#6b7280", margin:"2px 0" }}>
                    {(stop.address||"").replace(", USA","")}
                  </div>
                  {stop.phone && (
                    <a href={`tel:${stop.phone}`}
                       style={{ fontSize:12, color:"#2563eb" }}>📞 {stop.phone}</a>
                  )}
                  {stop.instructions && (
                    <div style={{ marginTop:6, background:"#fffbeb", border:"1px solid #fde68a",
                                   borderRadius:6, padding:"6px 8px", fontSize:12, color:"#92400e" }}>
                      📋 {stop.instructions}
                    </div>
                  )}
                </div>

                <div style={{ textAlign:"right", flexShrink:0 }}>
                  <div style={{ fontFamily:"'DM Mono',monospace", fontWeight:700,
                                 color:"#1a3a2a", fontSize:15 }}>{stop.bags}</div>
                  <div style={{ fontSize:10, color:"#6b7280" }}>bags</div>
                </div>
              </div>

              {stop.status === "pending" && (
                <div style={{ marginTop:10, display:"flex", gap:8 }}>
                  <a href={mapsUrl(stop.address)} target="_blank" rel="noreferrer"
                     style={{ height:34, padding:"0 12px", background:"#eff6ff", color:"#2563eb",
                              border:"1px solid #bfdbfe", borderRadius:8, fontSize:12, fontWeight:500,
                              display:"flex", alignItems:"center", gap:4 }}>
                    📍 Navigate
                  </a>
                  <button onClick={() => setActiveStop(stop.id === activeStop ? null : stop.id)}
                    style={{ flex:1, height:34,
                             background: stop.id===activeStop ? "#fef3c7" : "#1a6b3a",
                             color: stop.id===activeStop ? "#92400e" : "#fff",
                             border:"none", borderRadius:8, fontSize:12, fontWeight:600,
                             WebkitAppearance:"none" }}>
                    {stop.id===activeStop ? "▲ Close" : "✓ Mark Delivered"}
                  </button>
                </div>
              )}

              {activeStop === stop.id && stop.status === "pending" && (
                <div style={{ marginTop:10, padding:12, background:"#f9fafb",
                               borderRadius:8, border:"1px solid #e5e7eb" }}>
                  <textarea
                    placeholder="Optional note (e.g. 'Left at garage door')"
                    value={note} onChange={e => setNote(e.target.value)}
                    style={{ width:"100%", height:60, padding:8, border:"1px solid #e5e7eb",
                             borderRadius:6, fontSize:12, resize:"none", outline:"none",
                             marginBottom:8, fontFamily:"'DM Sans',sans-serif" }}
                  />
                  <div style={{ display:"flex", gap:8 }}>
                    <button onClick={() => markDelivered(stop.id, "skipped")} disabled={saving}
                      style={{ flex:1, height:36, background:"#fef2f2", color:"#dc2626",
                               border:"1px solid #fecaca", borderRadius:8, fontSize:12, fontWeight:600 }}>
                      Skip
                    </button>
                    <button onClick={() => markDelivered(stop.id, "delivered")} disabled={saving}
                      style={{ flex:2, height:36, background:"#16a34a", color:"#fff",
                               border:"none", borderRadius:8, fontSize:13, fontWeight:700 }}>
                      {saving ? "Saving..." : "✓ Delivered"}
                    </button>
                  </div>
                </div>
              )}

              {stop.status === "delivered" && (
                <div style={{ marginTop:6, fontSize:11, color:"#16a34a", fontWeight:500 }}>
                  ✓ Delivered{stop.driver_note ? ` — ${stop.driver_note}` : ""}
                </div>
              )}
              {stop.status === "skipped" && (
                <div style={{ marginTop:6, fontSize:11, color:"#dc2626", fontWeight:500 }}>
                  ✗ Skipped{stop.driver_note ? ` — ${stop.driver_note}` : ""}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {stops.length > 0 && stops.every(s => s.status !== "pending") && (
        <div style={{ margin:16, padding:20, background:"#f0fdf4", border:"2px solid #bbf7d0",
                       borderRadius:12, textAlign:"center" }}>
          <div style={{ fontSize:36, marginBottom:8 }}>🎉</div>
          <div style={{ fontWeight:700, fontSize:18, color:"#15803d" }}>Route Complete!</div>
          <div style={{ fontSize:13, color:"#16a34a", marginTop:4 }}>
            All {stops.length} stops delivered. Great work!
          </div>
        </div>
      )}
    </div>
  );
}
