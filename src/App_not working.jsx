import React, { useState, useEffect, useCallback, useRef } from "react";

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
    const TABLES  = ["stops", "routes", "pickup_orders", "vehicles", "drivers", "staff"];
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
const fmtPhone = (raw) => {
  if (!raw) return "";
  const d = String(raw).replace(/\D/g, "").replace(/^1(\d{10})$/, "$1");
  return d.length === 10 ? `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}` : raw;
};

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
  *{box-sizing:border-box;margin:0;padding:0;max-width:100%}
  html{overflow-x:hidden;width:100%}
  body{font-family:'DM Sans',sans-serif;background:#f4f6f8;color:#111827;-webkit-font-smoothing:antialiased;overflow-x:hidden;width:100%;max-width:100vw}
  #root{overflow-x:hidden;width:100%;max-width:100vw}
  ::-webkit-scrollbar{width:4px;height:4px}
  ::-webkit-scrollbar-thumb{background:#d1d5db;border-radius:2px}
  button{cursor:pointer;font-family:'DM Sans',sans-serif;-webkit-appearance:none;appearance:none;max-width:100%}
  input{font-family:'DM Sans',sans-serif;max-width:100%}
  a{color:inherit;text-decoration:none}
  img{max-width:100%;height:auto}
  .manager-layout{display:flex;flex-direction:column;min-height:100vh;overflow-x:hidden;width:100%}
  .manager-body{display:flex;flex:1;overflow:hidden;width:100%}
  .manager-sidebar{width:220px;flex-shrink:0;background:#fff;border-right:1px solid #e5e7eb;overflow-y:auto;display:flex;flex-direction:column}
  .manager-content{flex:1;overflow-y:auto;padding:20px}
  .manager-tabs-horizontal{background:#fff;border-bottom:1px solid #e5e7eb;display:flex;padding:0 20px;gap:4px;overflow-x:auto}
  .manager-tabs-vertical{padding:12px 8px;display:flex;flex-direction:column;gap:2px}
  .tab-btn-h{padding:12px 16px;border:none;background:none;font-size:13px;white-space:nowrap;cursor:pointer;font-family:'DM Sans',sans-serif}
  .tab-btn-v{padding:10px 14px;border:none;border-radius:8px;background:none;font-size:13px;text-align:left;cursor:pointer;font-family:'DM Sans',sans-serif;display:flex;align-items:center;gap:8px}
`;

// ── Responsive breakpoints ───────────────────────────────────────────────────
function useResponsive() {
  const [width, setWidth] = useState(() => window.innerWidth);
  useEffect(() => {
    const handler = () => setWidth(window.innerWidth);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);
  return {
    isMobile:  width < 640,
    isTablet:  width >= 640 && width < 1024,
    isDesktop: width >= 1024,
    width,
  };
}

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
// ── Vehicle helpers ───────────────────────────────────────────────────────────
const getVehicleBase = (v = "") => v.replace(/\s*[Tt]rip\s*\d+/g, "").replace(/\s*\(prev:.*?\)/gi, "").trim();
const getVehicleType = (v = "") => /van/i.test(v) ? "van" : "truck";

// ── Driver CSV parser (SignUpGenius format) ───────────────────────────────────
function parseDriversCsv(text) {
  // ── CSV tokeniser ──────────────────────────────────────────────────────────
  const rows = [];
  let cur = "", inQ = false, fields = [];
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (inQ && text[i + 1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (c === "," && !inQ) {
      fields.push(cur); cur = "";
    } else if ((c === "\n" || c === "\r") && !inQ) {
      if (c === "\r" && text[i + 1] === "\n") i++;
      fields.push(cur); cur = "";
      rows.push(fields); fields = [];
    } else { cur += c; }
  }
  if (fields.length || cur) { fields.push(cur); rows.push(fields); }
  if (rows.length < 2) return [];

  // ── Header-based column detection ─────────────────────────────────────────
  const headers = rows[0].map(h => h.trim().toLowerCase());
  const col = (names) => {
    for (const n of names) {
      const i = headers.indexOf(n.toLowerCase());
      if (i !== -1) return i;
    }
    return -1;
  };
  const iFirst    = col(["first name", "firstname"]);
  const iLast     = col(["last name", "lastname"]);
  const iEmail    = col(["email"]);
  const iPhone    = col(["mobile phone", "phone", "cell phone"]);
  // Format 2: one row per person, all signups in "Sign Up Items"
  // Format 3: one row per signup, shift/vehicle in "Item", time in "Start Date/Time"
  const iSignups  = col(["sign up items"]);
  const iItem     = col(["item"]);
  const iComment  = col(["sign up comment"]);
  const iStart    = col(["start date/time (mm/dd/yyyy)", "start date/time", "start date"]);

  const get = (row, i) => (i >= 0 && i < row.length ? row[i].trim() : "");

  const fmtPhone = (raw) => {
    const digits = raw.replace(/\D/g, "").replace(/^1(\d{10})$/, "$1");
    return digits.length === 10
      ? `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`
      : digits || "";
  };

  // Detect shift from text (time-based for format 2, keyword-based for format 3)
  const detectShift = (line, startDateTime = "") => {
    // Time-based (format 2: "7:30AM", "10:30AM", "1:30PM")
    if (/7:30\s*am/i.test(line))  return 1;
    if (/10:30\s*am/i.test(line)) return 2;
    if (/1:30\s*pm/i.test(line))  return 3;
    // Keyword-based (format 3 Item column: "Morning", "Mid-Day", "Late Afternoon")
    if (/morning/i.test(line))                          return 1;
    if (/mid.?day/i.test(line))                         return 2;
    if (/late\s*afternoon/i.test(line))                return 3;
    // Fallback: parse the Start Date/Time column for the hour
    if (startDateTime) {
      const m = startDateTime.match(/(\d{1,2}):(\d{2})\s*(am|pm)/i);
      if (m) {
        let h = parseInt(m[1]);
        if (/pm/i.test(m[3]) && h !== 12) h += 12;
        if (h >= 7  && h < 9)  return 1;  // ~7:30am
        if (h >= 10 && h < 12) return 2;  // ~10:30am
        if (h >= 13 && h < 15) return 3;  // ~1:30pm
      }
    }
    return null;
  };

  const parseSignupLine = (line, comment = "", startDateTime = "") => {
    const shift_num = detectShift(line, startDateTime);
    if (!shift_num) return null;
    let vehicleType = null;
    if      (/truck/i.test(line)) vehicleType = "truck";
    else if (/van/i.test(line))   vehicleType = "van";
    if (!vehicleType) return null;
    // Sport: from comment field (format 3) or after truck/van mention (format 2)
    let sport = comment.trim();
    if (!sport) {
      const m = line.match(/(?:truck|van)[^\-\n]*-\s*(.+)/i);
      sport = m ? m[1].replace(/,$/, "").trim() : "";
    }
    return { shift_num, vehicleType, sport };
  };

  const drivers = [];
  const upsert = (firstName, lastName, email, phone, signups) => {
    if (!firstName && !lastName) return;
    const key = `${firstName.toLowerCase()}_${lastName.toLowerCase()}`;
    const existing = drivers.find(d =>
      `${d.firstName.toLowerCase()}_${d.lastName.toLowerCase()}` === key);
    if (existing) {
      for (const s of signups)
        if (!existing.signups.some(e => e.shift_num === s.shift_num && e.vehicleType === s.vehicleType))
          existing.signups.push(s);
      if (!existing.phone && phone) existing.phone = phone;
    } else {
      drivers.push({ id: `${key}_${drivers.length}`, firstName, lastName, email, phone, signups });
    }
  };

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const firstName = get(row, iFirst);
    const lastName  = get(row, iLast);
    if (!firstName && !lastName) continue;
    const email = get(row, iEmail);
    const phone = fmtPhone(get(row, iPhone));

    if (iSignups >= 0) {
      // Format 2 — one row per person, newline-separated signups
      const lines = get(row, iSignups).split("\n").map(s => s.trim()).filter(Boolean);
      const signups = lines.map(l => parseSignupLine(l)).filter(Boolean);
      upsert(firstName, lastName, email, phone, signups);
    } else if (iItem >= 0) {
      // Format 3 — one row per signup slot
      const itemText     = get(row, iItem);
      const comment      = get(row, iComment);
      const startDateTime = get(row, iStart);
      const signup       = parseSignupLine(itemText, comment, startDateTime);
      upsert(firstName, lastName, email, phone, signup ? [signup] : []);
    }
  }
  return drivers;
}
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
  const [drivers, setDrivers]   = useState([]);
  const [vehicles, setVehicles] = useState({});
  const [staff, setStaff]       = useState([]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const routeId = params.get("route");
    const viewParam = params.get("view");
    if (routeId) {
      setView("driver_loading");
      loadDriverRoute(routeId);
    } else if (viewParam === "loading") {
      setView("loader");
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
      const [routeRows, driverRows, vehicleRows, pickupRows, stopRows, staffRows] = await Promise.all([
        sbGet("routes",        { select: "*", order: "shift_num.asc" }),
        sbGet("drivers",       { select: "*" }),
        sbGet("vehicles",      { select: "*" }),
        sbGet("pickup_orders", { select: "*", order: "name.asc" }),
        sbGet("stops",         { select: "route_id,status,bags" }),
        sbGet("staff",         { select: "*", order: "name.asc" }).catch(() => []),
      ]);
      const parseVehicle = (v = "") => {
        const isVan = /^van/i.test(v);
        const m = v.match(/(\d+)[^\d]+(\d+)/);
        return m ? [isVan ? 1 : 0, parseInt(m[1]), parseInt(m[2])] : [isVan ? 1 : 0, 0, 0];
      };
      const sorted = (routeRows || []).sort((a, b) => {
        if (a.shift_num !== b.shift_num) return a.shift_num - b.shift_num;
        const [atype, anum, atrip] = parseVehicle(a.vehicle);
        const [btype, bnum, btrip] = parseVehicle(b.vehicle);
        if (atype !== btype) return atype - btype;
        if (anum  !== bnum)  return anum  - bnum;
        return atrip - btrip;
      });
      setRoutes(sorted);
      setPickups(pickupRows || []);
      setAllStops(stopRows || []);
      if (driverRows) {
        // Deduplicate by full name — keeps the most recent row (Supabase returns newest last)
        const seen = new Map();
        for (const d of driverRows) {
          const key = `${d.first_name?.toLowerCase()}_${d.last_name?.toLowerCase()}`;
          seen.set(key, d);
        }
        setDrivers([...seen.values()].map(d => ({
          id:          String(d.id),
          firstName:   d.first_name,
          lastName:    d.last_name,
          email:       d.email       || "",
          phone:       d.phone       || "",
          sport:       d.sport       || "",
          vehiclePref: d.vehicle_pref || "both",
          signups:     d.signups     || [],
        })));
      }
      if (vehicleRows) {
        const vMap = {};
        vehicleRows.forEach(v => { vMap[v.vehicle_name] = v.plate || ""; });
        setVehicles(vMap);
      }
      if (staffRows) setStaff(staffRows);
    } catch(e) { console.error(e); }
  }, []);

  useRealtime(loadManagerData);

  useEffect(() => {
    if (view === "manager" || view === "loader") loadManagerData();
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
  if (view === "loader") {
    const _lvStopsByRoute = allStops.reduce((acc, s) => { (acc[s.route_id] = acc[s.route_id] || []).push(s); return acc; }, {});
    return <LoaderView routes={routes} vehicles={vehicles} staff={staff}
                       stopsByRoute={_lvStopsByRoute}
                       onMarkLoaded={async (id, bags) => { await sbPatch("routes", { is_loaded: true, bags_loaded: bags ?? null }, { id: `eq.${id}` }); loadManagerData(); }}
                       onResetLoaded={async (id) => { await sbPatch("routes", { is_loaded: false, bags_loaded: null }, { id: `eq.${id}` }); loadManagerData(); }}
                       onUpdateCurrentBags={async (vehicleName, bags) => {
                         await sbPatch("vehicles", { current_bags: bags }, { vehicle_name: `eq.${vehicleName}` });
                         loadManagerData();
                       }} />;
  }
  return <ManagerDashboard
    routes={routes}
    pickups={pickups}
    allStops={allStops}
    onReload={loadManagerData}
    loading={loading}
    drivers={drivers}
    setDrivers={setDrivers}
    vehicles={vehicles}
    setVehicles={setVehicles}
    staff={staff}
    setStaff={setStaff}
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
function openPrintWindow(routesList, stopsMatrix, appUrl, staff = []) {
  const depot = "11135 Newport Mill Rd, Kensington, MD 20895";
  const managers = (staff || []).filter(s => s.role === "manager");
  const pocHtml = managers.length > 0
    ? `<div class="poc-row"><strong>POC:</strong> ${managers.map(m => { const d = (m.phone||"").replace(/\D/g,"").replace(/^1(\d{10})$/,"$1"); const fmt = d.length===10?`(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`:m.phone; return `${m.name}${m.phone ? ` &mdash; ${fmt}` : ""}`; }).join(" &nbsp;|&nbsp; ")}</div>`
    : "";

  const parseVehicle = (v = "") => {
    const isVan = /^van/i.test(v);
    const m = v.match(/(\d+)[^\d]+(\d+)/);
    return m ? [isVan ? 1 : 0, parseInt(m[1]), parseInt(m[2])] : [isVan ? 1 : 0, 0, 0];
  };
  const order = routesList
    .map((r, i) => ({ r, i }))
    .sort((a, b) => {
      const [atype, anum, atrip] = parseVehicle(a.r.vehicle);
      const [btype, bnum, btrip] = parseVehicle(b.r.vehicle);
      if (atype !== btype) return atype - btype;
      if (anum  !== bnum)  return anum  - bnum;
      return atrip - btrip;
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
          ${s.phone ? `<span class="phone">&#9990; ${(s.phone.replace(/\D/g,"").replace(/^1(\d{10})$/,"$1").length===10 ? "("+s.phone.replace(/\D/g,"").replace(/^1(\d{10})$/,"$1").slice(0,3)+") "+s.phone.replace(/\D/g,"").replace(/^1(\d{10})$/,"$1").slice(3,6)+"-"+s.phone.replace(/\D/g,"").replace(/^1(\d{10})$/,"$1").slice(6) : s.phone)}</span>` : ""}
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
        <div class="safety-row">
          &#9888;&#65039; <strong>SAFETY:</strong> Allowing any person to ride in the bed or cargo area of a truck is prohibited. This practice is both illegal under state law and poses a serious risk of injury or death. Passengers must ride only in the cab, secured by a seatbelt at all times.
        </div>
        <div class="depot-row">
          &#128205; <strong>AEHS:</strong> ${depot}
        </div>
        ${pocHtml}
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
    .safety-row { background: #fff0f0; border: 1.5px solid #ff4444; border-radius: 6px;
                  padding: 7px 12px; margin-bottom: 8px; font-size: 10.5px; color: #7a0000;
                  font-weight: 600; line-height: 1.5; }
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
    .poc-row { background: #e8f4fd; border: 1px solid #bee3f8; border-radius: 6px;
               padding: 6px 12px; margin-bottom: 12px; font-size: 10.5px; color: #1a3a5c; }
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
function ManagerDashboard({ routes, pickups, allStops, onReload, loading, drivers, setDrivers, vehicles, setVehicles, staff, setStaff }) {
  const [activeShift, setActiveShift] = useState(0);
  const [activeTab,   setActiveTab]   = useState("routes");
  const [editingRoute, setEditingRoute] = useState(null);
  const [driverName, setDriverName]     = useState("");
  const [selectedDriverId, setSelectedDriverId] = useState(null);
  const [saving, setSaving]             = useState(false);
  const [qrRoute, setQrRoute]           = useState(null);
  const [printing, setPrinting]         = useState(false);
  const [autoAssignPrompt, setAutoAssignPrompt] = useState(null);
  const [autoAssigning, setAutoAssigning]       = useState(false);
  const [driverSearch, setDriverSearch]         = useState("");
  const [showUnassigned, setShowUnassigned]     = useState(false);
  const [orderSearch, setOrderSearch]           = useState("");
  const [orderResults, setOrderResults]         = useState([]);
  const [orderSearching, setOrderSearching]     = useState(false);
  const [showOrderSearch, setShowOrderSearch]   = useState(false);
  const [showStaffPanel, setShowStaffPanel]     = useState(false);
  const [showSmsBlast, setShowSmsBlast]         = useState(false);
  const [showAllDrivers, setShowAllDrivers]     = useState(false);
  const [driverModalSearch, setDriverModalSearch] = useState("");
  const [showAddDriverForm, setShowAddDriverForm] = useState(false);
  const [newDriverData, setNewDriverData]         = useState({ firstName:"", lastName:"", phone:"", email:"", sport:"" });

  const now = useNow();
  const { isMobile, isTablet, isDesktop } = useResponsive();

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
  const [resetModal, setResetModal] = useState(false);
  const [resetOpts, setResetOpts]   = useState({ delivery: true, drivers: true, plates: true, roster: false, staff: false });

  const resetAll = async (opts) => {
    setResetting(true);
    setResetModal(false);
    try {
      const ALL = { id: "neq.00000000-0000-0000-0000-000000000000" };
      if (opts.delivery) {
        const routePatch = { status: "unassigned", completed_at: null, started_at: null, is_loaded: false, bags_loaded: null };
        if (opts.drivers) { routePatch.driver_name = null; }
        await sbPatch("routes", routePatch, ALL);
        await sbPatch("stops",  { status: "pending", completed_at: null, driver_note: null }, ALL);
        await sbPatch("pickup_orders", { checked_out: false, checked_out_at: null, checked_out_by: null }, ALL);
      } else if (opts.drivers) {
        await sbPatch("routes", { driver_name: null, status: "unassigned" }, ALL);
      }
      if (opts.plates) {
        await fetch(`${SUPABASE_URL}/rest/v1/vehicles?id=gt.0`, {
          method: "DELETE",
          headers: { "apikey": SUPABASE_ANON, "Authorization": `Bearer ${SUPABASE_ANON}` }
        });
        setVehicles({});
      }
      if (opts.roster) {
        await fetch(`${SUPABASE_URL}/rest/v1/drivers?id=gt.0`, {
          method: "DELETE",
          headers: { "apikey": SUPABASE_ANON, "Authorization": `Bearer ${SUPABASE_ANON}` }
        });
        setDrivers([]);
      }
      if (opts.staff) {
        await fetch(`${SUPABASE_URL}/rest/v1/staff?id=neq.00000000-0000-0000-0000-000000000000`, {
          method: "DELETE",
          headers: { "apikey": SUPABASE_ANON, "Authorization": `Bearer ${SUPABASE_ANON}` }
        });
        setStaff([]);
      }
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

  const markLoaded = async (routeId, bagsLoaded) => {
    await sbPatch("routes", { is_loaded: true, bags_loaded: bagsLoaded ?? null }, { id: `eq.${routeId}` });
    onReload();
  };

  const resetLoaded = async (routeId) => {
    await sbPatch("routes", { is_loaded: false, bags_loaded: null }, { id: `eq.${routeId}` });
    onReload();
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
      const route = routes.find(r => r.id === editingRoute);
      const vehicleBase = getVehicleBase(route.vehicle);
      const siblings = routes.filter(r =>
        getVehicleBase(r.vehicle) === vehicleBase && r.shift_num === route.shift_num
      );
      await Promise.all(siblings.map(r =>
        sbPatch("routes", { driver_name: driverName.trim(), status: "assigned" }, { id: `eq.${r.id}` })
      ));
      setEditingRoute(null); setDriverName(""); setSelectedDriverId(null);
      onReload();
    } catch(e) { console.error(e); }
    setSaving(false);
  };

  const unassignDriver = async () => {
    if (!editingRoute) return;
    setSaving(true);
    try {
      const route = routes.find(r => r.id === editingRoute);
      const vehicleBase = getVehicleBase(route.vehicle);
      const siblings = routes.filter(r =>
        getVehicleBase(r.vehicle) === vehicleBase && r.shift_num === route.shift_num
      );
      await Promise.all(siblings.map(r =>
        sbPatch("routes", { driver_name: null, status: "unassigned" }, { id: `eq.${r.id}` })
      ));
      setEditingRoute(null); setDriverName(""); setSelectedDriverId(null);
      onReload();
    } catch(e) { console.error(e); }
    setSaving(false);
  };

  const handleCsvUpload = (csvText) => {
    const parsed = parseDriversCsv(csvText);
    if (!parsed.length) { alert("No drivers found. Check the CSV format."); return; }
    setAutoAssignPrompt(parsed);
  };

  const commitDrivers = async (parsed) => {
    setDrivers(parsed);
    // Upsert all drivers to Supabase
    await Promise.all(parsed.map(d =>
      fetch(`${SUPABASE_URL}/rest/v1/drivers`, {
        method: "POST",
        headers: {
          "apikey": SUPABASE_ANON,
          "Authorization": `Bearer ${SUPABASE_ANON}`,
          "Content-Type": "application/json",
          "Prefer": "resolution=merge-duplicates",
        },
        body: JSON.stringify({
          first_name: d.firstName,
          last_name:  d.lastName,
          email:      d.email,
          phone:      d.phone,
          signups:    d.signups,
          updated_at: new Date().toISOString(),
        })
      })
    ));
  };

  const saveVehiclePlate = async (vehicleName, plate) => {
    // Optimistic local update
    const updated = { ...vehicles };
    const existing = typeof updated[vehicleName] === "object" ? updated[vehicleName] : { currentBags: null };
    if (plate) updated[vehicleName] = { ...existing, plate };
    else delete updated[vehicleName];
    setVehicles(updated);

    if (!plate) {
      // Clearing — DELETE the row so there's no stale record on other devices
      await fetch(
        `${SUPABASE_URL}/rest/v1/vehicles?vehicle_name=eq.${encodeURIComponent(vehicleName)}`,
        {
          method: "DELETE",
          headers: {
            "apikey":        SUPABASE_ANON,
            "Authorization": `Bearer ${SUPABASE_ANON}`,
          },
        }
      );
    } else {
      // Saving — upsert with merge-duplicates
      await fetch(`${SUPABASE_URL}/rest/v1/vehicles`, {
        method: "POST",
        headers: {
          "apikey":        SUPABASE_ANON,
          "Authorization": `Bearer ${SUPABASE_ANON}`,
          "Content-Type":  "application/json",
          "Prefer":        "resolution=merge-duplicates",
        },
        body: JSON.stringify({
          vehicle_name: vehicleName,
          plate:        plate,
          updated_at:   new Date().toISOString(),
        }),
      });
    }
  };

  const performAutoAssign = async (driverList) => {
    setAutoAssigning(true);
    try {
      const unassigned = routes.filter(r => r.status === "unassigned");
      const groups = {};
      for (const r of unassigned) {
        const base = getVehicleBase(r.vehicle);
        const key  = `${base}__${r.shift_num}`;
        if (!groups[key]) groups[key] = { routes: [], vehicleType: getVehicleType(r.vehicle), shift_num: r.shift_num };
        groups[key].routes.push(r);
      }
      const usedPerShift = {};
      const patches = [];
      for (const { routes: gRoutes, vehicleType, shift_num } of Object.values(groups)) {
        if (!usedPerShift[shift_num]) usedPerShift[shift_num] = new Set();
        const driver = driverList.find(d =>
          d.signups.some(s => s.shift_num === shift_num && s.vehicleType === vehicleType) &&
          !usedPerShift[shift_num].has(d.id)
        );
        if (driver) {
          usedPerShift[shift_num].add(driver.id);
          const name = `${driver.firstName} ${driver.lastName}`;
          for (const r of gRoutes)
            patches.push(sbPatch("routes", { driver_name: name, status: "assigned" }, { id: `eq.${r.id}` }));
        }
      }
      await Promise.all(patches);
      onReload();
    } catch(e) { console.error(e); }
    setAutoAssigning(false);
  };

  const showQr = (route) => setQrRoute(route);
  const appUrl = (routeId) => `${window.location.origin}?route=${routeId}`;

  const printSingleRoute = async (route) => {
    try {
      const stops = await sbGet("stops", { select:"*", route_id:`eq.${route.id}`, order:"stop_num.asc" });
      openPrintWindow([route], [stops || []], appUrl, staff);
    } catch(e) { console.error(e); }
  };

  const printShiftRoutes = async () => {
    setPrinting(true);
    try {
      const shiftRts = routes.filter(r => r.shift_num === activeShift + 1);
      const stopsArr = await Promise.all(
        shiftRts.map(r => sbGet("stops", { select:"*", route_id:`eq.${r.id}`, order:"stop_num.asc" }))
      );
      openPrintWindow(shiftRts, stopsArr.map(s => s || []), appUrl, staff);
    } catch(e) { console.error(e); }
    setPrinting(false);
  };

  return (
    <div style={{ minHeight:"100vh", display:"flex", flexDirection:"column" }}>
      <style>{css}</style>

      {/* Header */}
      <header style={{ background:"#1a3a2a",
                       padding:"10px 20px",
                       position:"sticky", top:0, zIndex:100 }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 }}>
          <div style={{ display:"flex", alignItems:"center", gap:8, flex:1, minWidth:0 }}>
            <span style={{ fontSize:22 }}>🌿</span>
            <div>
              <span style={{ color:"#fff", fontWeight:700, fontSize:15 }}>AEHS Mulch <span style={{ color:"#4ade80" }}>Manager</span></span>
              {staff.filter(s => s.role === "manager").length > 0 && (
                <div style={{ display:"flex", gap:10, marginTop:2, flexWrap:"wrap" }}>
                  {staff.filter(s => s.role === "manager").map(s => (
                    <span key={s.id} style={{ fontSize:10, color:"rgba(255,255,255,.65)", fontWeight:500,
                                              overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap",
                                              maxWidth:160 }}>
                      {s.name}{s.phone ? ` · ${fmtPhone(s.phone)}` : ""}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <button onClick={() => setShowStaffPanel(true)}
              title="Staff — managers & loaders"
              style={{ width:30, height:30, borderRadius:"50%", border:"none",
                       background:"rgba(255,255,255,.12)", color:"#fff", fontSize:15,
                       cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>
              👥
            </button>
            <button onClick={() => setShowSmsBlast(true)}
              title="Send SMS to drivers or loaders"
              style={{ width:30, height:30, borderRadius:"50%", border:"none",
                       background:"rgba(255,255,255,.12)", color:"#fff", fontSize:15,
                       cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>
              💬
            </button>
            <button onClick={() => { setShowOrderSearch(true); setOrderSearch(""); setOrderResults([]); }}
              title="Search orders"
              style={{ width:30, height:30, borderRadius:"50%", border:"none",
                       background:"rgba(255,255,255,.12)", color:"#fff", fontSize:15,
                       cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>
              🔍
            </button>
          </div>
          <div style={{ display:"flex", gap:6 }}>
            <button onClick={onReload}
              style={{ background:"rgba(255,255,255,.1)", border:"1px solid rgba(255,255,255,.2)",
                       color:"#fff", borderRadius:6, padding:"4px 10px", fontSize:12 }}>↻</button>
            <button onClick={() => { setResetOpts({ delivery: true, drivers: true, plates: true }); setResetModal(true); }} disabled={resetting}
              style={{ background:"rgba(220,38,38,.25)", border:"1px solid rgba(220,38,38,.5)",
                       color:"#fca5a5", borderRadius:6, padding:"4px 8px", fontSize:11, fontWeight:600,
                       whiteSpace:"nowrap" }}>
              {resetting ? "…" : "⚠️ Reset"}
            </button>
          </div>
        </div>

        {/* Two-row stats table */}
        <div style={{ display:"grid", gridTemplateColumns:"auto repeat(6,1fr)", gap:"0 2px",
                      fontFamily:"'DM Mono',monospace", fontSize:11,
                      overflowX:"auto", WebkitOverflowScrolling:"touch" }}>
          <div style={{ color:"rgba(255,255,255,.4)", fontSize:"clamp(7px,2vw,10px)", display:"flex", flexDirection:"column", gap:2, paddingRight:"clamp(3px,1vw,8px)" }}>
            <div style={{ height:"clamp(22px,5vw,30px)", display:"flex", alignItems:"center", fontWeight:600 }}>TOTAL</div>
            <div style={{ height:"clamp(18px,4vw,24px)", display:"flex", alignItems:"center", fontWeight:600 }}>DONE</div>
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
              <div key={label} style={{ background:"rgba(255,255,255,.07)", borderRadius:6, padding:"3px clamp(2px,0.8vw,8px)", textAlign:"center", minWidth:0, overflow:"hidden" }}>
                <div style={{ color:"rgba(255,255,255,.5)", fontSize:"clamp(7px,1.6vw,9px)", textTransform:"uppercase", marginBottom:1, letterSpacing:0 }}>{label}</div>
                <div style={{ height:"clamp(22px,5vw,30px)", display:"flex", alignItems:"center", justifyContent:"center" }}>
                  <span style={{ color:"#fff", fontWeight:700, fontSize:"clamp(10px,3vw,15px)" }}>{total}</span>
                </div>
                {done !== null ? (
                  <>
                    <div style={{ height:2, background:"rgba(255,255,255,.15)", borderRadius:1, margin:"2px 0 4px" }}>
                      <div style={{ height:"100%", background:"#4ade80", borderRadius:1, width:`${pct}%`, transition:"width .4s" }} />
                    </div>
                    <div style={{ height:"clamp(18px,4vw,24px)", display:"flex", alignItems:"center", justifyContent:"center" }}>
                      <span style={{ color:"#4ade80", fontWeight:600, fontSize:"clamp(9px,2.5vw,13px)" }}>{done}</span>
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
                    display:"flex", padding:"0 20px", gap:4, overflowX:"auto" }}>
        {[["routes","🚛 Routes"],["pickups","🏠 Pickups"],["drivers","👥 Drivers"],["vehicles","🚐 Vehicles"],["loading","📦 Loading"]].map(([k,l]) => (
          <button key={k} onClick={() => setActiveTab(k)}
            style={{ padding:"12px 16px", border:"none", background:"none", fontSize:13,
                     fontWeight: activeTab===k ? 700 : 400, whiteSpace:"nowrap",
                     color: activeTab===k ? "#1a3a2a" : "#6b7280",
                     borderBottom: activeTab===k ? "2px solid #1a3a2a" : "2px solid transparent" }}>
            {l}
          </button>
        ))}
      </div>

      <div style={{ flex:1, overflow:"auto", padding: isDesktop ? "20px 28px" : 16,
                    maxWidth: isDesktop ? 1400 : undefined,
                    width: "100%", boxSizing:"border-box",
                    margin: isDesktop ? "0 auto" : undefined }}>

        {/* Drivers tab */}
        {activeTab === "drivers" && (
          <DriversTab
            drivers={drivers}
            routes={routes}
            onUpload={handleCsvUpload}
            onUpdate={async (id, payload) => {
              await fetch(`${SUPABASE_URL}/rest/v1/drivers?id=eq.${id}`, {
                method: "PATCH",
                headers: { "apikey": SUPABASE_ANON, "Authorization": `Bearer ${SUPABASE_ANON}`,
                           "Content-Type": "application/json", "Prefer": "return=minimal" },
                body: JSON.stringify({
                  first_name: payload.firstName,
                  last_name:  payload.lastName,
                  phone:      payload.phone,
                  email:      payload.email,
                  sport:      payload.sport || null,
                  vehicle_pref: payload.vehiclePref || null,
                  updated_at: new Date().toISOString(),
                }),
              });
              setDrivers(drivers.map(d => d.id === id ? { ...d, ...payload } : d));
            }}
            onClear={async () => {
              setDrivers([]);
              // Delete all driver rows
              await fetch(`${SUPABASE_URL}/rest/v1/drivers?id=gt.0`, {
                method: "DELETE",
                headers: { "apikey": SUPABASE_ANON, "Authorization": `Bearer ${SUPABASE_ANON}` }
              });
              // Also clear driver assignments from all routes
              await sbPatch("routes",
                { driver_name: null, status: "unassigned" },
                { id: "neq.00000000-0000-0000-0000-000000000000" }
              );
              onReload();
            }}
          />
        )}

        {/* Vehicles tab */}
        {activeTab === "vehicles" && (
          <VehiclesTab
            routes={routes}
            vehicles={vehicles}
            onSave={saveVehiclePlate}
            onResetAll={async () => {
              if (!window.confirm("Clear ALL license plates? This cannot be undone.")) return;
              setVehicles({});
              await fetch(`${SUPABASE_URL}/rest/v1/vehicles?id=gt.0`, {
                method: "DELETE",
                headers: { "apikey": SUPABASE_ANON, "Authorization": `Bearer ${SUPABASE_ANON}` }
              });
            }}
          />
        )}

        {/* Loading tab */}
        {activeTab === "loading" && (
          <LoadingTab
            routes={routes}
            vehicles={vehicles}
            staff={staff}
            stopsByRoute={stopsByRoute}
            onMarkLoaded={markLoaded}
            onResetLoaded={resetLoaded}
            onUpdateCurrentBags={async (vehicleName, bags) => {
              await fetch(`${SUPABASE_URL}/rest/v1/vehicles?vehicle_name=eq.${encodeURIComponent(vehicleName)}`, {
                method: "PATCH",
                headers: { "apikey": SUPABASE_ANON, "Authorization": `Bearer ${SUPABASE_ANON}`,
                           "Content-Type": "application/json", "Prefer": "return=minimal" },
                body: JSON.stringify({ current_bags: bags }),
              });
              setVehicles(prev => ({
                ...prev,
                [vehicleName]: { ...(typeof prev[vehicleName] === "object" ? prev[vehicleName] : { plate: prev[vehicleName] || "" }), currentBags: bags },
              }));
            }}
          />
        )}

        {/* QR tab */}
        {activeTab === "qr" && (
          <div>
            <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:16 }}>
              <div style={{ width:10, height:10, borderRadius:"50%", background:SHIFT_COLORS[activeShift], flexShrink:0 }} />
              <span style={{ fontWeight:700, fontSize:14, color:"#111827" }}>
                {["Shift 1 (7:30am)","Shift 2 (10:30am)","Shift 3 (1:30pm)"][activeShift]}
              </span>
              <span style={{ fontSize:12, color:"#6b7280" }}>
                — {shiftRoutes.length} routes
              </span>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(min(280px,100vw - 32px),1fr))", gap:12 }}>
              {shiftRoutes.map(r => (
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
            <div style={{ display:"flex", flexDirection:"column", gap:8, marginBottom:16 }}>
              <div style={{ display:"flex", gap:8 }}>
                {SHIFTS.map((s, i) => {
                  const sr = routes.filter(r => r.shift_num === i+1);
                  const done = sr.filter(r => r.status === "complete").length;
                  return (
                    <button key={i} onClick={() => setActiveShift(i)}
                      style={{ flex:1, padding:"10px 4px", border:"2px solid",
                               borderColor: activeShift===i ? SHIFT_COLORS[i] : "#e5e7eb",
                               borderRadius:10, background: activeShift===i ? SHIFT_COLORS[i] : "#fff",
                               color: activeShift===i ? "#fff" : "#374151",
                               fontWeight:600, fontSize:12, transition:"all .15s" }}>
                      <div>{s.split(" ")[0]} {s.split(" ")[1]}</div>
                      <div style={{ fontSize:10, opacity:.8, fontWeight:400, marginTop:2 }}>
                        {sr.length} routes · {done} done
                      </div>
                    </button>
                  );
                })}
              </div>
              <div style={{ display:"flex", gap:8 }}>
                <button onClick={printShiftRoutes} disabled={printing}
                  style={{ flex:1, padding:"8px 10px", border:`2px solid ${SHIFT_COLORS[activeShift]}`, borderRadius:10,
                           background: printing ? "#e5e7eb" : SHIFT_COLORS[activeShift], color:"#fff",
                           fontWeight:600, fontSize:12, cursor: printing ? "default" : "pointer" }}>
                  {printing ? "⏳ Loading…" : `🖨️ Print Shift ${activeShift + 1}`}
                </button>
                <button onClick={() => setActiveTab("qr")}
                  style={{ flex:1, padding:"8px 10px", border:`2px solid ${SHIFT_COLORS[activeShift]}`, borderRadius:10,
                           background: SHIFT_COLORS[activeShift], color:"#fff", fontWeight:600, fontSize:12,
                           cursor:"pointer" }}>
                  📱 QR Shift {activeShift + 1}
                </button>
              </div>
            </div>

            {/* Shift summary dashboard */}
            {(() => {
              const sr = shiftRoutes;
              const totalBags   = sr.reduce((s, r) => s + (r.total_bags  || 0), 0);
              const totalStops  = sr.reduce((s, r) => s + (r.total_stops || 0), 0);
              const totalRoutes = sr.length;
              const assigned    = sr.filter(r => r.status === "assigned" || r.driver_name).length;
              const done        = sr.filter(r => r.status === "done").length;
              const color       = SHIFT_COLORS[activeShift];
              const stats = [
                { label: "Bags",     value: totalBags.toLocaleString() },
                { label: "Routes",   value: totalRoutes },
                { label: "Stops",    value: totalStops },
                { label: "Assigned", value: `${assigned}/${totalRoutes}` },
                { label: "Done",     value: `${done}/${totalRoutes}` },
              ];
              return (
                <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8, marginBottom:12 }}>
                  {stats.map(({ label, value }) => (
                    <div key={label}
                         style={{ background:"#fff",
                                  border:`1.5px solid ${color}22`,
                                  borderRadius:10, padding:"10px 14px",
                                  boxShadow:"0 1px 4px rgba(0,0,0,.06)" }}>
                      <div style={{ fontSize:11, fontWeight:700, color:"#9ca3af",
                                    textTransform:"uppercase", letterSpacing:.5, marginBottom:4 }}>
                        {label}
                      </div>
                      <div style={{ fontSize:22, fontWeight:800, color:"#111827",
                                    fontFamily:"'DM Mono',monospace", lineHeight:1 }}>
                        {value}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}

            {/* Search + Unassigned toggle */}
            <div style={{ display:"flex", gap:8, marginBottom:12, alignItems:"center" }}>
              <div style={{ position:"relative", flex:1 }}>
                <span style={{ position:"absolute", left:10, top:"50%", transform:"translateY(-50%)",
                               fontSize:14, pointerEvents:"none" }}>🔍</span>
                <input
                  value={driverSearch}
                  onChange={e => { setDriverSearch(e.target.value); if (e.target.value) setShowUnassigned(false); }}
                  placeholder="Search driver…"
                  style={{ width:"100%", height:36, padding:"0 30px 0 30px", border:"1px solid #e5e7eb",
                           borderRadius:8, fontSize:13, outline:"none", background:"#fff",
                           boxSizing:"border-box" }}
                />
                {driverSearch && (
                  <button onClick={() => setDriverSearch("")}
                    style={{ position:"absolute", right:8, top:"50%", transform:"translateY(-50%)",
                             background:"none", border:"none", fontSize:14, cursor:"pointer",
                             color:"#9ca3af", lineHeight:1 }}>✕</button>
                )}
              </div>
              <button onClick={() => { setShowUnassigned(v => !v); setDriverSearch(""); }}
                style={{ height:36, padding:"0 12px", borderRadius:8, fontSize:12, fontWeight:600,
                         cursor:"pointer", whiteSpace:"nowrap", flexShrink:0,
                         background: showUnassigned ? "#1a3a2a" : "#f3f4f6",
                         color: showUnassigned ? "#fff" : "#374151",
                         border: showUnassigned ? "none" : "1px solid #e5e7eb" }}>
                {showUnassigned ? "✕ Unassigned" : "Unassigned"}
              </button>
            </div>

            {/* Route cards */}
            {(() => {
              const q = driverSearch.trim().toLowerCase();
              const displayRoutes = q
                ? routes.filter(r => r.driver_name && r.driver_name.toLowerCase().includes(q))
                : showUnassigned
                  ? shiftRoutes.filter(r => !r.driver_name)
                  : shiftRoutes;
              const isSearching = q.length > 0;
              return (
                <>
                  {showUnassigned && !q && (
                    <div style={{ fontSize:12, color:"#6b7280", marginBottom:8 }}>
                      {displayRoutes.length} unassigned trip{displayRoutes.length!==1?"s":""}
                    </div>
                  )}
                  {isSearching && (
                    <div style={{ fontSize:12, color:"#6b7280", marginBottom:8 }}>
                      {displayRoutes.length} trip{displayRoutes.length!==1?"s":""} matching "{driverSearch}"
                      {displayRoutes.length > 0 && (
                        <span style={{ marginLeft:6, color:"#9ca3af" }}>
                          — across {[...new Set(displayRoutes.map(r=>r.shift))].join(", ")}
                        </span>
                      )}
                    </div>
                  )}
                  <div style={{ display:"grid",
                               gridTemplateColumns:"repeat(auto-fill,minmax(min(420px,100vw - 32px),1fr))",
                               gap:12 }}>
                    {(() => {
                      // Group trips by vehicle base + shift, sorted by vehicle number
                      const seen = new Map();
                      for (const r of displayRoutes) {
                        const key = `${getVehicleBase(r.vehicle)}__${r.shift_num}`;
                        if (!seen.has(key)) seen.set(key, []);
                        seen.get(key).push(r);
                      }
                      // Sort groups: vans after trucks, then numerically by vehicle number
                      const groups = [...seen.keys()].sort((a, b) => {
                        const [baseA] = a.split("__");
                        const [baseB] = b.split("__");
                        const aIsVan = /van/i.test(baseA), bIsVan = /van/i.test(baseB);
                        if (aIsVan !== bIsVan) return aIsVan ? 1 : -1;
                        const numA = parseInt((baseA.match(/\d+/) || [0])[0]);
                        const numB = parseInt((baseB.match(/\d+/) || [0])[0]);
                        return numA - numB;
                      });
                      const makeHandlers = (r) => ({
                        liveStops: stopsByRoute[r.id] || [],
                        onAssign: () => { setEditingRoute(r.id); setDriverName(r.driver_name || ""); },
                        onQr: () => showQr(r),
                        onPrint: () => printSingleRoute(r),
                        onMarkComplete: () => markRouteComplete(r.id),
                        onResetRoute: () => resetRoute(r.id),
                        onMarkLoaded: () => markLoaded(r.id),
                        onResetLoaded: () => resetLoaded(r.id),
                        onUpdateDriverPhone: async (driverName, phone) => {
                          const d = drivers.find(d => `${d.firstName} ${d.lastName}`.toLowerCase() === driverName.toLowerCase());
                          if (d) {
                            // Driver is in the roster — update existing row
                            await fetch(`${SUPABASE_URL}/rest/v1/drivers?id=eq.${d.id}`, {
                              method: "PATCH",
                              headers: { "apikey": SUPABASE_ANON, "Authorization": `Bearer ${SUPABASE_ANON}`,
                                         "Content-Type": "application/json", "Prefer": "return=minimal" },
                              body: JSON.stringify({ phone, updated_at: new Date().toISOString() })
                            });
                            setDrivers(drivers.map(dr => dr.id === d.id ? { ...dr, phone } : dr));
                          } else {
                            // Driver was manually typed — upsert a new row by name
                            const parts = driverName.trim().split(" ");
                            const firstName = parts[0] || driverName;
                            const lastName  = parts.slice(1).join(" ") || "";
                            await fetch(`${SUPABASE_URL}/rest/v1/drivers`, {
                              method: "POST",
                              headers: { "apikey": SUPABASE_ANON, "Authorization": `Bearer ${SUPABASE_ANON}`,
                                         "Content-Type": "application/json",
                                         "Prefer": "resolution=merge-duplicates,return=representation" },
                              body: JSON.stringify({ first_name: firstName, last_name: lastName,
                                                     phone, signups: [], updated_at: new Date().toISOString() })
                            });
                            // Add to local state so SMS button appears immediately
                            setDrivers([...drivers, { id: `manual_${Date.now()}`, firstName, lastName,
                                                       email: "", phone, signups: [] }]);
                          }
                        },
                      });
                      return groups.map(key => {
                        const trips = seen.get(key);
                        return (
                          <VehicleGroup key={key} trips={trips} now={now} vehicles={vehicles} drivers={drivers}
                            stopsByRoute={stopsByRoute} appUrl={appUrl}
                            makeHandlers={makeHandlers}
                            allShiftRoutes={shiftRoutes}
                            allRoutes={routes}
                            onAssignFirst={() => { setEditingRoute(trips[0].id); setDriverName(trips[0].driver_name || ""); }}
                            onMoveRoute={async (routeId, newVehicleName) => {
                              const movedRoute = routes.find(r => r.id === routeId);
                              const srcBase = getVehicleBase(movedRoute?.vehicle || "");

                              // 1. Rename moved route with prev note
                              const prevNote = srcBase ? ` (prev: ${srcBase})` : "";
                              await sbPatch("routes", { vehicle: `${newVehicleName}${prevNote}` }, { id: `eq.${routeId}` });

                              // 2. Fetch FRESH routes from DB for src vehicle to avoid stale closure
                              if (srcBase) {
                                const allFresh = await sbGet("routes", { select: "id,vehicle,shift_num" });
                                const tripNum = (v) => { const m = (v||"").match(/[Tt]rip\s*(\d+)/); return m ? parseInt(m[1]) : 0; };
                                const remaining = (allFresh || [])
                                  .filter(r => r.id !== routeId && getVehicleBase(r.vehicle) === srcBase && r.shift_num === movedRoute.shift_num)
                                  .sort((a, b) => tripNum(a.vehicle) - tripNum(b.vehicle));

                                if (remaining.length === 0) {
                                  // nothing to do
                                } else if (remaining.length === 1) {
                                  // Single trip left — keep Trip 1 label for clarity
                                  await sbPatch("routes", { vehicle: `${srcBase} Trip 1` }, { id: `eq.${remaining[0].id}` });
                                } else {
                                  // Renumber Trip 1, Trip 2, …
                                  await Promise.all(remaining.map((r, i) =>
                                    sbPatch("routes", { vehicle: `${srcBase} Trip ${i + 1}` }, { id: `eq.${r.id}` })
                                  ));
                                }
                              }

                              onReload();
                            }}
                            onSavePhone={async (phone) => {
                              const driverName = trips[0].driver_name;
                              const d = drivers.find(d => `${d.firstName} ${d.lastName}`.toLowerCase() === driverName.toLowerCase());
                              if (!d) return;
                              await fetch(`${SUPABASE_URL}/rest/v1/drivers?id=eq.${d.id}`, {
                                method: "PATCH",
                                headers: { "apikey": SUPABASE_ANON, "Authorization": `Bearer ${SUPABASE_ANON}`,
                                           "Content-Type": "application/json", "Prefer": "return=minimal" },
                                body: JSON.stringify({ phone, updated_at: new Date().toISOString() })
                              });
                              setDrivers(drivers.map(dr => dr.id === d.id ? { ...dr, phone } : dr));
                            }}
                          />
                        );
                      });
                    })()}
                  </div>
                </>
              );
            })()}
          </>
        )}
      {/* SMS + Email Blast modal */}
      {showSmsBlast && (() => {
        const loadingUrl = `${window.location.origin}?view=loading`;
        const shiftNum = activeShift + 1;

        const driverRouteMap = routes
          .filter(r => r.driver_name && r.shift_num === shiftNum)
          .reduce((acc, r) => {
            const key = r.driver_name.trim().toLowerCase();
            if (!acc[key]) {
              const d = (drivers || []).find(d =>
                `${d.firstName} ${d.lastName}`.trim().toLowerCase() === key
              );
              acc[key] = {
                name: r.driver_name,
                phone: fmtPhone(d?.phone || ""),
                digits: (d?.phone || "").replace(/\D/g, ""),
                email: d?.email || "",
                vehicle: r.vehicle,
                routeUrl: `${window.location.origin}?route=${r.id}`,
                routeId: r.id,
              };
            }
            return acc;
          }, {});
        const assignedDrivers = Object.values(driverRouteMap);

        const driverEmailBody = (d) =>
          `Hi ${d.name.split(" ")[0]},\n\nHere is your AEHS Mulch 2026 delivery route for ${d.vehicle}:\n${d.routeUrl}\n\nThank you for volunteering!\nAEHS Boosters`;

        const shiftLoaders = (staff || []).filter(s =>
          s.role === "loader" && (s.shifts || []).includes(shiftNum)
        ).map(l => ({
          name: l.name,
          digits: (l.phone || "").replace(/\D/g, ""),
          phone: fmtPhone(l.phone || ""),
          email: l.email || "",
          smsBody: `Hi ${l.name.split(" ")[0]}, here is the AEHS Mulch loading page: ${loadingUrl}`,
          emailBody: `Hi ${l.name.split(" ")[0]},\n\nHere is the AEHS Mulch 2026 loading page for your shift:\n${loadingUrl}\n\nThank you!\nAEHS Boosters`,
        }));

        const btnSms  = { height:28, padding:"0 8px", borderRadius:6, fontSize:11, fontWeight:700,
                          textDecoration:"none", display:"flex", alignItems:"center", whiteSpace:"nowrap",
                          background:"#22c55e", color:"#fff" };
        const btnEmail = { ...btnSms, background:"#2563eb" };
        const btnAllSms   = { display:"block", textAlign:"center", padding:"7px 0", borderRadius:8,
                              fontSize:12, fontWeight:700, textDecoration:"none", background:"#1a3a2a", color:"#fff" };
        const btnAllEmail = { ...btnAllSms, background:"#2563eb" };
        const btnAllLoaderSms   = { ...btnAllSms, background:"#d97706" };
        const btnAllLoaderEmail = { ...btnAllSms, background:"#7c3aed" };

        return (
          <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.55)", zIndex:300,
                        display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}
               onClick={() => setShowSmsBlast(false)}>
            <div onClick={e => e.stopPropagation()}
                 style={{ background:"#fff", borderRadius:14, width:460, maxWidth:"calc(100vw - 32px)",
                          maxHeight:"90vh", display:"flex", flexDirection:"column",
                          boxShadow:"0 20px 60px rgba(0,0,0,.3)", overflow:"hidden" }}>
              <div style={{ padding:"14px 20px", background:"#1a3a2a", flexShrink:0,
                            display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <div style={{ color:"#fff", fontWeight:700, fontSize:15 }}>📣 Contact Drivers & Loaders</div>
                <button onClick={() => setShowSmsBlast(false)}
                  style={{ background:"rgba(255,255,255,.15)", border:"none", color:"#fff",
                           borderRadius:6, width:28, height:28, cursor:"pointer", fontSize:14 }}>✕</button>
              </div>
              <div style={{ overflowY:"auto", flex:1, padding:"16px 20px" }}>
                <div style={{ marginBottom:20 }}>
                  <div style={{ fontSize:11, fontWeight:700, color:"#6b7280", textTransform:"uppercase",
                                 letterSpacing:.5, marginBottom:8 }}>
                    🚛 Drivers — Shift {shiftNum}
                  </div>
                  {assignedDrivers.length === 0 ? (
                    <div style={{ fontSize:12, color:"#d1d5db", fontStyle:"italic" }}>No assigned drivers this shift</div>
                  ) : (<>
                    {assignedDrivers.map((d, i) => (
                      <div key={i} style={{ display:"flex", alignItems:"center", gap:6, marginBottom:6,
                                            padding:"8px 10px", background:"#f0fdf4",
                                            border:"1px solid #bbf7d0", borderRadius:8 }}>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontWeight:700, fontSize:13 }}>{d.name}</div>
                          <div style={{ fontSize:11, color:"#6b7280" }}>
                            {d.phone && `📞 ${d.phone}`}{d.phone && d.email ? "  ·  " : ""}{d.email && `✉️ ${d.email}`}
                          </div>
                          <div style={{ fontSize:10, color:"#9ca3af" }}>{getVehicleBase(d.vehicle)}</div>
                        </div>
                        <div style={{ display:"flex", gap:4, flexShrink:0 }}>
                          {d.digits.length >= 10 && (
                            <a href={`sms:${d.digits}?body=${encodeURIComponent(`Hi ${d.name.split(" ")[0]}, here is your AEHS Mulch route: ${d.routeUrl}`)}`}
                               style={btnSms} title="Send SMS">💬</a>
                          )}
                          {d.email && (
                            <a href={`mailto:${d.email}?subject=${encodeURIComponent("AEHS Mulch 2026 — Your Delivery Route")}&body=${encodeURIComponent(driverEmailBody(d))}`}
                               style={btnEmail} title="Send Email">✉️</a>
                          )}
                        </div>
                      </div>
                    ))}
                    <div style={{ display:"flex", gap:6, marginTop:8 }}>
                      {assignedDrivers.some(d => d.digits.length >= 10) && (
                        <a href={`sms:${assignedDrivers.filter(d => d.digits.length >= 10).map(d => d.digits).join(",")}?body=${encodeURIComponent("Hi, your AEHS Mulch route link is in a separate text from the manager.")}`}
                           style={{ ...btnAllSms, flex:1 }}>
                          💬 SMS All Drivers
                        </a>
                      )}
                      {assignedDrivers.some(d => d.email) && (
                        <a href={`mailto:${assignedDrivers.filter(d => d.email).map(d => d.email).join(",")}?subject=${encodeURIComponent("AEHS Mulch 2026 — Your Delivery Route")}&body=${encodeURIComponent("Hi team, route links below:\n\n" + assignedDrivers.filter(d => d.email).map(d => d.name + " (" + getVehicleBase(d.vehicle) + "): " + d.routeUrl).join("\n") + "\n\nThank you!\nAEHS Boosters")}`}
                           style={{ ...btnAllEmail, flex:1 }}>
                          ✉️ Email All Drivers
                        </a>
                      )}
                    </div>
                  </>)}
                </div>
                <div>
                  <div style={{ fontSize:11, fontWeight:700, color:"#6b7280", textTransform:"uppercase",
                                 letterSpacing:.5, marginBottom:8 }}>
                    📦 Loaders — Shift {shiftNum}
                  </div>
                  {shiftLoaders.length === 0 ? (
                    <div style={{ fontSize:12, color:"#d1d5db", fontStyle:"italic" }}>No loaders for this shift</div>
                  ) : (<>
                    {shiftLoaders.map((l, i) => (
                      <div key={i} style={{ display:"flex", alignItems:"center", gap:6, marginBottom:6,
                                            padding:"8px 10px", background:"#fffbeb",
                                            border:"1px solid #fde68a", borderRadius:8 }}>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontWeight:700, fontSize:13 }}>{l.name}</div>
                          <div style={{ fontSize:11, color:"#6b7280" }}>
                            {l.phone && `📞 ${l.phone}`}{l.phone && l.email ? "  ·  " : ""}{l.email && `✉️ ${l.email}`}
                          </div>
                        </div>
                        <div style={{ display:"flex", gap:4, flexShrink:0 }}>
                          {l.digits.length >= 10 && (
                            <a href={`sms:${l.digits}?body=${encodeURIComponent(l.smsBody)}`}
                               style={btnSms} title="Send SMS">💬</a>
                          )}
                          {l.email && (
                            <a href={`mailto:${l.email}?subject=${encodeURIComponent("AEHS Mulch 2026 — Loading Page")}&body=${encodeURIComponent(l.emailBody)}`}
                               style={btnEmail} title="Send Email">✉️</a>
                          )}
                        </div>
                      </div>
                    ))}
                    <div style={{ display:"flex", gap:6, marginTop:8 }}>
                      {shiftLoaders.some(l => l.digits.length >= 10) && (
                        <a href={`sms:${shiftLoaders.filter(l => l.digits.length >= 10).map(l => l.digits).join(",")}?body=${encodeURIComponent(`Hi, here is the AEHS Mulch loading page for your shift: ${loadingUrl}`)}`}
                           style={{ ...btnAllLoaderSms, flex:1 }}>
                          💬 SMS All Loaders
                        </a>
                      )}
                      {shiftLoaders.some(l => l.email) && (
                        <a href={`mailto:${shiftLoaders.filter(l => l.email).map(l => l.email).join(",")}?subject=${encodeURIComponent("AEHS Mulch 2026 — Loading Page")}&body=${encodeURIComponent(`Hi team,\n\nHere is the loading page for your shift:\n${loadingUrl}\n\nThank you!\nAEHS Boosters`)}`}
                           style={{ ...btnAllLoaderEmail, flex:1 }}>
                          ✉️ Email All Loaders
                        </a>
                      )}
                    </div>
                  </>)}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Staff Panel — managers & loaders */}
      {showStaffPanel && (
        <StaffPanel
          staff={staff}
          onClose={() => setShowStaffPanel(false)}
          onAdd={async (member) => {
            const res = await fetch(`${SUPABASE_URL}/rest/v1/staff`, {
              method: "POST",
              headers: { "apikey": SUPABASE_ANON, "Authorization": `Bearer ${SUPABASE_ANON}`,
                         "Content-Type": "application/json", "Prefer": "return=representation" },
              body: JSON.stringify(member),
            });
            if (res.ok) { const rows = await res.json(); setStaff([...staff, rows[0]]); }
          }}
          onRemove={async (id) => {
            await fetch(`${SUPABASE_URL}/rest/v1/staff?id=eq.${id}`, {
              method: "DELETE",
              headers: { "apikey": SUPABASE_ANON, "Authorization": `Bearer ${SUPABASE_ANON}` },
            });
            setStaff(staff.filter(s => s.id !== id));
          }}
          onUpdate={async (id, payload) => {
            await fetch(`${SUPABASE_URL}/rest/v1/staff?id=eq.${id}`, {
              method: "PATCH",
              headers: { "apikey": SUPABASE_ANON, "Authorization": `Bearer ${SUPABASE_ANON}`,
                         "Content-Type": "application/json", "Prefer": "return=minimal" },
              body: JSON.stringify(payload),
            });
            setStaff(staff.map(s => s.id === id ? { ...s, ...payload } : s));
          }}
        />
      )}

      {/* Order Search overlay */}
      {showOrderSearch && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.6)", zIndex:300,
                      display:"flex", flexDirection:"column", padding:16 }}
             onClick={() => setShowOrderSearch(false)}>
          <div onClick={e => e.stopPropagation()}
               style={{ background:"#fff", borderRadius:14, width:"100%", maxWidth:520,
                        margin:"0 auto", maxHeight:"90vh", display:"flex", flexDirection:"column",
                        boxShadow:"0 20px 60px rgba(0,0,0,.4)", overflow:"hidden" }}>
            {/* Search header */}
            <div style={{ padding:"14px 16px", borderBottom:"1px solid #e5e7eb", background:"#1a3a2a" }}>
              <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                <div style={{ position:"relative", flex:1 }}>
                  <span style={{ position:"absolute", left:10, top:"50%", transform:"translateY(-50%)",
                                  fontSize:14, pointerEvents:"none" }}>🔍</span>
                  <input autoFocus
                    value={orderSearch}
                    onChange={async e => {
                      const q = e.target.value;
                      setOrderSearch(q);
                      if (q.trim().length < 2) { setOrderResults([]); return; }
                      setOrderSearching(true);
                      try {
                        const ql = q.trim().toLowerCase();
                        // Search stops table by name, address, phone, email
                        const [byName, byAddr, byPhone, byEmail] = await Promise.all([
                          sbGet("stops", { select:"*", name:`ilike.*${q.trim()}*`, limit:"30" }),
                          sbGet("stops", { select:"*", address:`ilike.*${q.trim()}*`, limit:"30" }),
                          sbGet("stops", { select:"*", phone:`ilike.*${q.trim()}*`, limit:"30" }),
                          sbGet("stops", { select:"*", email:`ilike.*${q.trim()}*`, limit:"30" }),
                        ]);
                        const all = [...(byName||[]), ...(byAddr||[]), ...(byPhone||[]), ...(byEmail||[])];
                        const unique = [...new Map(all.map(s => [s.id, s])).values()];
                        // Attach route info
                        setOrderResults(unique.slice(0,40));
                      } catch(e) { console.error(e); }
                      setOrderSearching(false);
                    }}
                    placeholder="Search by name, address, phone, or email…"
                    style={{ width:"100%", height:40, padding:"0 12px 0 32px", border:"none",
                             borderRadius:8, fontSize:14, outline:"none", background:"rgba(255,255,255,.15)",
                             color:"#fff", boxSizing:"border-box" }}
                  />
                </div>
                <button onClick={() => setShowOrderSearch(false)}
                  style={{ width:36, height:36, borderRadius:8, border:"none",
                           background:"rgba(255,255,255,.15)", color:"#fff", fontSize:16, cursor:"pointer" }}>✕</button>
              </div>
              {orderSearch.trim().length >= 2 && (
                <div style={{ color:"rgba(255,255,255,.6)", fontSize:11, marginTop:6 }}>
                  {orderSearching ? "Searching…" : `${orderResults.length} result${orderResults.length!==1?"s":""}`}
                </div>
              )}
            </div>

            {/* Results */}
            <div style={{ overflowY:"auto", flex:1 }}>
              {orderSearch.trim().length < 2 ? (
                <div style={{ padding:32, textAlign:"center", color:"#9ca3af", fontSize:13 }}>
                  Type at least 2 characters to search
                </div>
              ) : orderSearching ? (
                <div style={{ padding:32, textAlign:"center", color:"#9ca3af", fontSize:13 }}>Searching…</div>
              ) : orderResults.length === 0 ? (
                <div style={{ padding:32, textAlign:"center", color:"#9ca3af", fontSize:13 }}>No results found</div>
              ) : (
                orderResults.map(s => {
                  const route = routes.find(r => r.id === s.route_id);
                  const routeStarted = route?.started_at || route?.status === "in_progress" || route?.status === "complete";
                  const shiftLabel = route ? SHIFTS[route.shift_num - 1] : null;

                  // Status label + time
                  let statusBg, statusColor, statusText;
                  if (s.status === "delivered") {
                    statusBg = "#dcfce7"; statusColor = "#15803d";
                    const t = s.completed_at ? fmtTime(s.completed_at) : null;
                    statusText = t ? `✓ Delivered @ ${t}` : "✓ Delivered";
                  } else if (s.status === "skipped") {
                    statusBg = "#fee2e2"; statusColor = "#dc2626";
                    statusText = "✗ Skipped";
                  } else if (routeStarted) {
                    statusBg = "#fef3c7"; statusColor = "#d97706";
                    statusText = "🚛 Out for Delivery";
                  } else {
                    statusBg = "#f3f4f6"; statusColor = "#6b7280";
                    statusText = "📅 Scheduled";
                  }

                  return (
                    <div key={s.id} style={{ padding:"12px 16px", borderBottom:"1px solid #f3f4f6",
                                             background: s.status==="delivered" ? "#f0fdf4"
                                                       : s.status==="skipped" ? "#fff7f7" : "#fff" }}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:8 }}>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ display:"flex", alignItems:"center", gap:6, flexWrap:"wrap", marginBottom:4 }}>
                            <span style={{ fontWeight:700, fontSize:14, color:"#111827" }}>{s.name}</span>
                            <span style={{ fontFamily:"'DM Mono',monospace", fontWeight:700,
                                            fontSize:12, color:"#1a3a2a" }}>{s.bags} bags</span>
                          </div>
                          {/* Status + shift row */}
                          <div style={{ display:"flex", alignItems:"center", gap:6, flexWrap:"wrap", marginBottom:4 }}>
                            <span style={{ fontSize:11, padding:"2px 8px", borderRadius:8, fontWeight:600,
                                            background: statusBg, color: statusColor }}>
                              {statusText}
                            </span>
                            {shiftLabel && (
                              <span style={{ fontSize:11, padding:"2px 8px", borderRadius:8, fontWeight:600,
                                              background:"#eff6ff", color:"#2563eb" }}>
                                {shiftLabel}
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize:12, color:"#6b7280", marginTop:2 }}>
                            {(s.address||"").replace(", USA","")}
                          </div>
                          <div style={{ display:"flex", gap:12, marginTop:2, flexWrap:"wrap" }}>
                            {s.phone && <PhoneLink phone={s.phone} style={{ fontSize:11 }} />}
                            {s.email && <span style={{ fontSize:11, color:"#2563eb" }}>✉️ {s.email}</span>}
                          </div>
                          {s.instructions && (
                            <div style={{ fontSize:11, color:"#92400e", marginTop:3,
                                           background:"#fffbeb", borderRadius:4, padding:"3px 6px",
                                           display:"inline-block" }}>
                              📋 {s.instructions.substring(0,80)}{s.instructions.length>80?"…":""}
                            </div>
                          )}
                        </div>
                        <div style={{ flexShrink:0, textAlign:"right" }}>
                          {route && (
                            <>
                              <div style={{ fontSize:11, fontFamily:"'DM Mono',monospace",
                                             fontWeight:700, color:"#374151" }}>
                                {getVehicleBase(route.vehicle)}
                              </div>
                              <div style={{ fontSize:10, color:"#9ca3af" }}>Stop {s.stop_num}</div>
                              {route.driver_name && (
                                <div style={{ fontSize:10, color:"#6b7280", marginTop:1 }}>
                                  👤 {route.driver_name}
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

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

      {/* Reset modal */}
      {resetModal && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.55)", zIndex:400,
                      display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}
             onClick={() => setResetModal(false)}>
          <div onClick={e => e.stopPropagation()}
               style={{ background:"#fff", borderRadius:16, padding:28, width:360, maxWidth:"100%",
                        boxShadow:"0 20px 60px rgba(0,0,0,.3)" }}>
            <div style={{ fontSize:28, textAlign:"center", marginBottom:8 }}>⚠️</div>
            <h3 style={{ fontSize:17, fontWeight:700, marginBottom:4, textAlign:"center" }}>Reset Options</h3>
            <p style={{ fontSize:13, color:"#6b7280", marginBottom:20, textAlign:"center", lineHeight:1.5 }}>
              Select what to reset. This cannot be undone.
            </p>
            <div style={{ display:"flex", flexDirection:"column", gap:12, marginBottom:24 }}>
              {[
                { key:"delivery", label:"Route delivery status", desc:"Clears all stop completions and route progress" },
                { key:"drivers",  label:"Driver assignments",    desc:"Removes all driver names from routes" },
                { key:"plates",   label:"License plates",        desc:"Clears all saved vehicle plates" },
                { key:"roster",   label:"Drivers roster",        desc:"Removes all drivers loaded from CSV" },
                { key:"staff",    label:"Managers & loaders",    desc:"Removes all staff (managers and loaders)" },
              ].map(({ key, label, desc }) => (
                <label key={key}
                  style={{ display:"flex", gap:12, alignItems:"flex-start", cursor:"pointer",
                           padding:"10px 12px", borderRadius:10,
                           background: resetOpts[key] ? "#fef2f2" : "#f9fafb",
                           border:`1px solid ${resetOpts[key] ? "#fca5a5" : "#e5e7eb"}` }}>
                  <input type="checkbox" checked={resetOpts[key]}
                    onChange={e => setResetOpts(o => ({ ...o, [key]: e.target.checked }))}
                    style={{ marginTop:2, accentColor:"#dc2626", width:16, height:16, flexShrink:0 }} />
                  <div>
                    <div style={{ fontWeight:600, fontSize:14, color:"#111827" }}>{label}</div>
                    <div style={{ fontSize:12, color:"#6b7280", marginTop:1 }}>{desc}</div>
                  </div>
                </label>
              ))}
            </div>
            <div style={{ display:"flex", gap:10 }}>
              <button onClick={() => setResetModal(false)}
                style={{ flex:1, height:42, border:"1px solid #e5e7eb", borderRadius:10,
                         background:"#f9fafb", fontSize:14, fontWeight:500 }}>Cancel</button>
              <button
                disabled={!resetOpts.delivery && !resetOpts.drivers && !resetOpts.plates && !resetOpts.roster && !resetOpts.staff}
                onClick={() => resetAll(resetOpts)}
                style={{ flex:1, height:42, background: (!resetOpts.delivery && !resetOpts.drivers && !resetOpts.plates && !resetOpts.roster && !resetOpts.staff) ? "#d1d5db" : "#dc2626",
                         color:"#fff", border:"none", borderRadius:10, fontSize:14, fontWeight:700, cursor:"pointer" }}>
                Reset Selected
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Auto-assign prompt */}
      {autoAssignPrompt && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.55)", zIndex:300,
                      display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}
             onClick={() => setAutoAssignPrompt(null)}>
          <div onClick={e => e.stopPropagation()}
               style={{ background:"#fff", borderRadius:16, padding:28, width:380, maxWidth:"100%",
                        boxShadow:"0 20px 60px rgba(0,0,0,.3)" }}>
            <div style={{ fontSize:28, textAlign:"center", marginBottom:10 }}>👥</div>
            <h3 style={{ fontSize:17, fontWeight:700, marginBottom:8, textAlign:"center" }}>
              {autoAssignPrompt.length} Drivers Loaded
            </h3>
            <p style={{ fontSize:13, color:"#6b7280", marginBottom:16, textAlign:"center", lineHeight:1.5 }}>
              Auto-assign drivers to unassigned routes based on their vehicle type and shift?
            </p>
            <div style={{ background:"#f9fafb", borderRadius:10, padding:"10px 14px", marginBottom:20,
                          fontSize:12, color:"#374151", lineHeight:1.9 }}>
              {autoAssignPrompt.slice(0, 8).map(d => (
                <div key={d.id} style={{ display:"flex", justifyContent:"space-between" }}>
                  <span style={{ fontWeight:600 }}>{d.firstName} {d.lastName}</span>
                  <span style={{ color:"#9ca3af" }}>
                    {d.signups.map(s => `S${s.shift_num} ${s.vehicleType}`).join(", ")}
                  </span>
                </div>
              ))}
              {autoAssignPrompt.length > 8 && (
                <div style={{ color:"#9ca3af", fontStyle:"italic" }}>…and {autoAssignPrompt.length - 8} more</div>
              )}
            </div>
            <div style={{ display:"flex", gap:10 }}>
              <button onClick={() => { commitDrivers(autoAssignPrompt); setAutoAssignPrompt(null); }}
                style={{ flex:1, height:42, border:"1px solid #e5e7eb", borderRadius:10,
                         background:"#f9fafb", fontSize:13, fontWeight:500, color:"#374151" }}>
                No, Assign Manually
              </button>
              <button onClick={() => { commitDrivers(autoAssignPrompt); performAutoAssign(autoAssignPrompt); setAutoAssignPrompt(null); }}
                disabled={autoAssigning}
                style={{ flex:1, height:42, background:"#1a3a2a", color:"#fff",
                         border:"none", borderRadius:10, fontSize:13, fontWeight:700 }}>
                {autoAssigning ? "Assigning…" : "✓ Yes, Auto-Assign"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Assign driver modal */}
      {editingRoute && (() => {
        const routeObj = routes.find(r => r.id === editingRoute);
        const vType = routeObj ? getVehicleType(routeObj.vehicle) : null;
        const filteredDrivers = routeObj
          ? drivers.filter(d => d.signups.some(s =>
              s.shift_num === routeObj.shift_num && s.vehicleType === vType))
          : [];
        const alreadyAssigned = new Set(routes.map(r => r.driver_name).filter(Boolean));
        const tripCount = routeObj
          ? routes.filter(r => getVehicleBase(r.vehicle) === getVehicleBase(routeObj.vehicle) && r.shift_num === routeObj.shift_num).length
          : 1;
        return (
          <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.5)", zIndex:200,
                        display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}
               onClick={() => { setEditingRoute(null); setSelectedDriverId(null); setDriverName(""); setShowAllDrivers(false); setDriverModalSearch(""); setShowAddDriverForm(false); setNewDriverData({ firstName:"", lastName:"", phone:"", email:"", sport:"" }); }}>
            <div onClick={e => e.stopPropagation()}
                 style={{ background:"#fff", borderRadius:14, width:360, maxWidth:"100%",
                          maxHeight:"85vh", display:"flex", flexDirection:"column",
                          boxShadow:"0 20px 60px rgba(0,0,0,.3)", overflow:"hidden" }}>
              {/* Scrollable driver list */}
              <div style={{ padding:"16px 20px", overflowY:"auto", flex:1 }}>
                <h3 style={{ marginBottom:4, fontSize:15, fontWeight:700 }}>Assign Driver</h3>
                {routeObj && (
                  <div style={{ fontSize:12, color:"#6b7280", marginBottom:12 }}>
                    <span style={{ background:"#f3f4f6", borderRadius:6, padding:"2px 8px",
                                    fontFamily:"'DM Mono',monospace", fontWeight:600, fontSize:11, marginRight:6 }}>
                      {getVehicleBase(routeObj.vehicle)}
                    </span>
                    {routeObj.shift} · {vType === "van" ? "🚐 Van" : "🚛 Truck"}
                  </div>
                )}

                {/* Search box */}
                <div style={{ position:"relative", marginBottom:12 }}>
                  <span style={{ position:"absolute", left:10, top:"50%", transform:"translateY(-50%)", fontSize:14, pointerEvents:"none" }}>🔍</span>
                  <input
                    value={driverModalSearch}
                    onChange={e => setDriverModalSearch(e.target.value)}
                    placeholder="Search drivers…"
                    style={{ width:"100%", height:36, padding:"0 32px 0 32px", border:"1px solid #e5e7eb",
                             borderRadius:8, fontSize:13, outline:"none", boxSizing:"border-box" }}
                  />
                  {driverModalSearch && (
                    <button onClick={() => setDriverModalSearch("")}
                      style={{ position:"absolute", right:8, top:"50%", transform:"translateY(-50%)",
                               background:"none", border:"none", fontSize:14, cursor:"pointer", color:"#9ca3af" }}>✕</button>
                  )}
                </div>

                {drivers.length > 0 && (() => {
                  const q = driverModalSearch.trim().toLowerCase();
                  const matchedList = filteredDrivers.filter(d =>
                    !q || `${d.firstName} ${d.lastName}`.toLowerCase().includes(q)
                  );
                  const otherList = drivers.filter(d =>
                    !filteredDrivers.some(f => f.id === d.id) &&
                    (!q || `${d.firstName} ${d.lastName}`.toLowerCase().includes(q))
                  );

                  const renderDriver = (d, showDiffBadge) => {
                    const fullName = `${d.firstName} ${d.lastName}`;
                    const isSelected = selectedDriverId === d.id;
                    const isAssigned = alreadyAssigned.has(fullName);
                    const sport = d.signups.find(s =>
                      s.shift_num === routeObj?.shift_num && s.vehicleType === vType)?.sport || "";
                    return (
                      <button key={d.id}
                        onClick={() => { setSelectedDriverId(d.id); setDriverName(fullName); }}
                        style={{ padding:"10px 12px", border:`2px solid ${isSelected ? "#1a3a2a" : "#e5e7eb"}`,
                                 borderRadius:10, background: isSelected ? "#f0fdf4" : "#fff",
                                 textAlign:"left", cursor:"pointer", width:"100%", marginBottom:6 }}>
                        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                          <div style={{ flex:1, minWidth:0 }}>
                            <div style={{ display:"flex", alignItems:"center", gap:6, flexWrap:"wrap" }}>
                              <span style={{ fontWeight:700, fontSize:14, color:"#111827" }}>{fullName}</span>
                              {isAssigned && (
                                <span style={{ background:"#fef3c7", color:"#92400e",
                                                fontSize:10, padding:"1px 6px", borderRadius:8, fontWeight:600 }}>
                                  Already assigned
                                </span>
                              )}
                              {showDiffBadge && (
                                <span style={{ background:"#f3f4f6", color:"#6b7280",
                                                fontSize:10, padding:"1px 6px", borderRadius:8, fontWeight:600 }}>
                                  Diff shift/vehicle
                                </span>
                              )}
                            </div>
                            {d.phone && <div style={{ marginTop:2 }}><PhoneLink phone={d.phone} style={{ fontSize:11 }} /></div>}
                            {sport && <div style={{ fontSize:11, color:"#2563eb", marginTop:1 }}>🏅 {sport.substring(0,55)}{sport.length>55?"…":""}</div>}
                          </div>
                          {isSelected && <span style={{ color:"#1a3a2a", fontSize:18, flexShrink:0 }}>✓</span>}
                        </div>
                      </button>
                    );
                  };

                  return (
                    <>
                      {matchedList.length > 0 && (
                        <>
                          <div style={{ fontSize:11, fontWeight:700, color:"#6b7280", textTransform:"uppercase",
                                        letterSpacing:.5, marginBottom:8 }}>
                            Signed up · {vType} · Shift {routeObj?.shift_num}
                          </div>
                          {matchedList.map(d => renderDriver(d, false))}
                        </>
                      )}

                      {matchedList.length === 0 && !q && filteredDrivers.length === 0 && (
                        <div style={{ padding:"10px 14px", background:"#fffbeb", border:"1px solid #fde68a",
                                      borderRadius:8, fontSize:12, color:"#92400e", marginBottom:10 }}>
                          No drivers match this shift & vehicle type.
                        </div>
                      )}

                      {/* Show All toggle */}
                      {!q && otherList.length > 0 && (
                        <button onClick={() => setShowAllDrivers(v => !v)}
                          style={{ width:"100%", padding:"8px 0", marginTop: matchedList.length > 0 ? 10 : 0,
                                   marginBottom: showAllDrivers ? 10 : 0,
                                   background:"none", border:"1px dashed #d1d5db", borderRadius:8,
                                   fontSize:12, fontWeight:600, color:"#6b7280", cursor:"pointer" }}>
                          {showAllDrivers
                            ? `▲ Hide other drivers`
                            : `▼ Show all drivers (${otherList.length} others)`}
                        </button>
                      )}

                      {(showAllDrivers || q) && otherList.length > 0 && (
                        <>
                          <div style={{ fontSize:11, fontWeight:700, color:"#9ca3af", textTransform:"uppercase",
                                        letterSpacing:.5, margin:"10px 0 8px" }}>
                            All Other Drivers
                          </div>
                          {otherList.map(d => renderDriver(d, true))}
                        </>
                      )}

                      {q && matchedList.length === 0 && otherList.length === 0 && (
                        <div style={{ textAlign:"center", color:"#9ca3af", fontSize:13, padding:"20px 0" }}>
                          No drivers match "{driverModalSearch}"
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>

              {/* Sticky footer — name input + buttons always visible */}
              <div style={{ padding:"12px 20px 16px", borderTop:"1px solid #e5e7eb", background:"#fff", flexShrink:0 }}>
                {tripCount > 1 && (
                  <div style={{ fontSize:11, color:"#9ca3af", marginBottom:8 }}>
                    ℹ️ Assigns to all <strong style={{ color:"#374151" }}>{tripCount} trips</strong> for this vehicle this shift
                  </div>
                )}
                {routeObj?.driver_name && (
                  <button onClick={unassignDriver} disabled={saving}
                    style={{ width:"100%", height:36, marginBottom:8, background:"#fef2f2",
                             color:"#dc2626", border:"1px solid #fecaca", borderRadius:8,
                             fontSize:13, fontWeight:600, cursor:"pointer" }}>
                    {saving ? "Removing…" : `✕ Remove Assignment (${routeObj.driver_name})`}
                  </button>
                )}
                {/* Add Driver inline form or button */}
                {showAddDriverForm ? (
                  <div style={{ border:"1px solid #e5e7eb", borderRadius:10, padding:12, marginBottom:8, background:"#f9fafb" }}>
                    <div style={{ fontSize:11, fontWeight:700, color:"#6b7280", textTransform:"uppercase",
                                   letterSpacing:.5, marginBottom:8 }}>New Driver Profile</div>
                    <div style={{ display:"flex", gap:6, marginBottom:6 }}>
                      <input value={newDriverData.firstName}
                        onChange={e => setNewDriverData(d => ({ ...d, firstName: e.target.value }))}
                        placeholder="First name" autoFocus
                        style={{ flex:1, height:34, padding:"0 8px", border:"1px solid #e5e7eb",
                                 borderRadius:7, fontSize:12, outline:"none" }} />
                      <input value={newDriverData.lastName}
                        onChange={e => setNewDriverData(d => ({ ...d, lastName: e.target.value }))}
                        placeholder="Last name"
                        style={{ flex:1, height:34, padding:"0 8px", border:"1px solid #e5e7eb",
                                 borderRadius:7, fontSize:12, outline:"none" }} />
                    </div>
                    <div style={{ display:"flex", gap:6, marginBottom:6 }}>
                      <input value={newDriverData.phone}
                        onChange={e => setNewDriverData(d => ({ ...d, phone: e.target.value }))}
                        placeholder="Phone"
                        style={{ flex:1, height:34, padding:"0 8px", border:"1px solid #e5e7eb",
                                 borderRadius:7, fontSize:12, outline:"none" }} />
                      <input value={newDriverData.email}
                        onChange={e => setNewDriverData(d => ({ ...d, email: e.target.value }))}
                        placeholder="Email"
                        style={{ flex:1, height:34, padding:"0 8px", border:"1px solid #e5e7eb",
                                 borderRadius:7, fontSize:12, outline:"none" }} />
                    </div>
                    <input value={newDriverData.sport}
                      onChange={e => setNewDriverData(d => ({ ...d, sport: e.target.value }))}
                      placeholder="School sport / team"
                      style={{ width:"100%", height:34, padding:"0 8px", border:"1px solid #e5e7eb",
                               borderRadius:7, fontSize:12, outline:"none", boxSizing:"border-box", marginBottom:8 }} />
                    <div style={{ display:"flex", gap:6 }}>
                      <button onClick={() => setShowAddDriverForm(false)}
                        style={{ flex:1, height:34, border:"1px solid #9ca3af", borderRadius:7,
                                 background:"#f3f4f6", color:"#374151", fontSize:12, fontWeight:600, cursor:"pointer" }}>
                        Cancel
                      </button>
                      <button disabled={saving || !newDriverData.firstName.trim()}
                        onClick={async () => {
                          if (!newDriverData.firstName.trim()) return;
                          setSaving(true);
                          const fullName = `${newDriverData.firstName.trim()} ${newDriverData.lastName.trim()}`.trim();
                          // Upsert to drivers table
                          await fetch(`${SUPABASE_URL}/rest/v1/drivers`, {
                            method: "POST",
                            headers: { "apikey": SUPABASE_ANON, "Authorization": `Bearer ${SUPABASE_ANON}`,
                                       "Content-Type": "application/json",
                                       "Prefer": "resolution=merge-duplicates,return=representation" },
                            body: JSON.stringify({
                              first_name: newDriverData.firstName.trim(),
                              last_name:  newDriverData.lastName.trim(),
                              phone:      newDriverData.phone.trim(),
                              email:      newDriverData.email.trim(),
                              sport:      newDriverData.sport.trim() || null,
                              signups:    newDriverData.sport.trim()
                                ? [{ shift_num: routeObj?.shift_num || 1,
                                     vehicleType: getVehicleType(routeObj?.vehicle || "truck"),
                                     sport: newDriverData.sport.trim() }]
                                : [],
                              updated_at: new Date().toISOString(),
                            })
                          });
                          // Add to local drivers state and auto-select
                          const newD = { id: `new_${Date.now()}`, firstName: newDriverData.firstName.trim(),
                                         lastName: newDriverData.lastName.trim(), email: newDriverData.email.trim(),
                                         phone: newDriverData.phone.trim(), sport: newDriverData.sport.trim(), signups: [] };
                          setDrivers([...drivers, newD]);
                          setDriverName(fullName);
                          setShowAddDriverForm(false);
                          setNewDriverData({ firstName:"", lastName:"", phone:"", email:"", sport:"" });
                          setSaving(false);
                        }}
                        style={{ flex:2, height:34, background: newDriverData.firstName.trim() ? "#1a3a2a" : "#d1d5db",
                                 color:"#fff", border:"none", borderRadius:7, fontSize:12, fontWeight:700, cursor:"pointer" }}>
                        {saving ? "…" : "Save & Select"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => setShowAddDriverForm(true)}
                    style={{ width:"100%", height:36, marginBottom:8, background:"#f0fdf4",
                             color:"#1a3a2a", border:"1px solid #bbf7d0", borderRadius:8,
                             fontSize:12, fontWeight:600, cursor:"pointer" }}>
                    + Add New Driver
                  </button>
                )}

                <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                  <div style={{ flex:1, height:40, padding:"0 10px", border:"1px solid #e5e7eb",
                               borderRadius:8, fontSize:13, color: driverName ? "#111827" : "#9ca3af",
                               display:"flex", alignItems:"center", background:"#f9fafb" }}>
                    {driverName || "No driver selected"}
                  </div>
                  <button onClick={() => { setEditingRoute(null); setSelectedDriverId(null); setDriverName(""); setShowAllDrivers(false); setDriverModalSearch(""); setShowAddDriverForm(false); setNewDriverData({ firstName:"", lastName:"", phone:"", email:"", sport:"" }); }}
                    style={{ height:40, padding:"0 14px", border:"1px solid #9ca3af", borderRadius:8,
                             background:"#f3f4f6", color:"#374151", fontSize:13, fontWeight:600, whiteSpace:"nowrap" }}>Cancel</button>
                  <button onClick={assignDriver} disabled={saving || !driverName.trim()}
                    style={{ height:40, padding:"0 14px", background: driverName.trim() ? "#1a3a2a" : "#d1d5db",
                             color:"#fff", border:"none", borderRadius:8, fontSize:13, fontWeight:700, whiteSpace:"nowrap" }}>
                    {saving ? "…" : "Assign"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

    </div>
    </div>
  );
}



// ── Staff Panel (Managers & Loaders) ─────────────────────────────────────────
function StaffPanel({ staff, onClose, onAdd, onRemove, onUpdate }) {
  const SHIFT_LABELS = ["Shift 1 (7:30am)", "Shift 2 (10:30am)", "Shift 3 (1:30pm)"];
  const blank = { name:"", phone:"", email:"", sport:"", role:"manager", shifts:[] };

  const [form, setForm]       = useState(blank);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState("");

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const toggleShift = (n) => set("shifts", form.shifts.includes(n) ? form.shifts.filter(x => x !== n) : [...form.shifts, n]);

  const startEdit = (s) => {
    setForm({ name: s.name, phone: s.phone||"", email: s.email||"", sport: s.sport||"", role: s.role, shifts: s.shifts||[] });
    setEditingId(s.id);
    setError("");
  };
  const cancelEdit = () => { setForm(blank); setEditingId(null); setError(""); };

  const handleSave = async () => {
    if (!form.name.trim()) { setError("Name is required."); return; }
    if (form.role === "loader" && form.shifts.length === 0) { setError("Select at least one shift."); return; }
    setError(""); setSaving(true);
    const payload = { name: form.name.trim(), phone: form.phone.trim(), email: form.email.trim(),
                      sport: form.sport.trim(), role: form.role, shifts: form.role === "loader" ? form.shifts : [] };
    if (editingId) {
      await onUpdate(editingId, payload);
      setEditingId(null);
    } else {
      await onAdd(payload);
    }
    setForm(blank); setSaving(false);
  };

  const managers = staff.filter(s => s.role === "manager");
  const loaders  = staff.filter(s => s.role === "loader");

  const renderCard = (s, bg, border, nameColor) => {
    const isEditing = editingId === s.id;
    return (
      <div key={s.id} style={{ marginBottom:8, background: isEditing ? "#fff" : bg,
                                border:`1px solid ${isEditing ? "#1a3a2a" : border}`,
                                borderRadius:10, overflow:"hidden" }}>
        {isEditing ? (
          <div style={{ padding:"12px 12px" }}>
            <div style={{ display:"flex", gap:6, marginBottom:6 }}>
              <input value={form.name} onChange={e => set("name", e.target.value)}
                placeholder="Name" style={{ flex:1, height:34, padding:"0 8px", border:"1px solid #e5e7eb", borderRadius:7, fontSize:12, outline:"none" }} />
            </div>
            <div style={{ display:"flex", gap:6, marginBottom:6 }}>
              <input value={form.phone} onChange={e => set("phone", e.target.value)}
                placeholder="Phone" style={{ flex:1, height:34, padding:"0 8px", border:"1px solid #e5e7eb", borderRadius:7, fontSize:12, outline:"none" }} />
              <input value={form.email} onChange={e => set("email", e.target.value)}
                placeholder="Email" style={{ flex:1, height:34, padding:"0 8px", border:"1px solid #e5e7eb", borderRadius:7, fontSize:12, outline:"none" }} />
            </div>
            <input value={form.sport} onChange={e => set("sport", e.target.value)}
              placeholder="Sport / team (comma-separated)" style={{ width:"100%", height:34, padding:"0 8px", border:"1px solid #e5e7eb", borderRadius:7, fontSize:12, outline:"none", boxSizing:"border-box", marginBottom:6 }} />
            {form.role === "loader" && (
              <div style={{ display:"flex", gap:8, marginBottom:6, flexWrap:"wrap" }}>
                {SHIFT_LABELS.map((label, i) => (
                  <label key={i} style={{ display:"flex", alignItems:"center", gap:4, fontSize:11, cursor:"pointer" }}>
                    <input type="checkbox" checked={form.shifts.includes(i+1)} onChange={() => toggleShift(i+1)} />
                    {label}
                  </label>
                ))}
              </div>
            )}
            {error && <div style={{ fontSize:11, color:"#dc2626", marginBottom:6 }}>⚠ {error}</div>}
            <div style={{ display:"flex", gap:6 }}>
              <button onClick={cancelEdit} style={{ flex:1, height:32, border:"1px solid #9ca3af", borderRadius:7, background:"#f3f4f6", color:"#374151", fontSize:12, fontWeight:600, cursor:"pointer" }}>Cancel</button>
              <button onClick={handleSave} disabled={saving} style={{ flex:2, height:32, background: saving ? "#9ca3af" : "#1a3a2a", color:"#fff", border:"none", borderRadius:7, fontSize:12, fontWeight:700, cursor:"pointer" }}>
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        ) : (
          <div style={{ padding:"8px 10px", display:"flex", alignItems:"flex-start", gap:8 }}>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontWeight:700, fontSize:13, color: nameColor }}>{s.name}</div>
              <div style={{ fontSize:11, color:"#6b7280", marginTop:1 }}>
                {s.phone ? `📞 ${fmtPhone(s.phone)}` : ""}
                {s.phone && s.email ? "  ·  " : ""}
                {s.email ? `✉️ ${s.email}` : ""}
              </div>
              {s.role === "loader" && (s.shifts||[]).length > 0 && (
                <div style={{ fontSize:11, color:"#6b7280" }}>
                  {(s.shifts||[]).map(n => SHIFT_LABELS[n-1]?.split(" ")[1] || `S${n}`).join(", ")}
                </div>
              )}
              {s.sport && <div style={{ fontSize:11, color:"#2563eb", marginTop:1 }}>🏅 {s.sport}</div>}
            </div>
            <div style={{ display:"flex", gap:4, flexShrink:0 }}>
              <button onClick={() => startEdit(s)}
                style={{ background:"#eff6ff", border:"1px solid #bfdbfe", color:"#2563eb",
                         borderRadius:6, padding:"2px 8px", fontSize:11, cursor:"pointer", fontWeight:600 }}>✏️</button>
              <button onClick={() => onRemove(s.id)}
                style={{ background:"#fef2f2", border:"1px solid #fca5a5", color:"#dc2626",
                         borderRadius:6, padding:"2px 8px", fontSize:11, cursor:"pointer" }}>✕</button>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.55)", zIndex:300,
                  display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}
         onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
           style={{ background:"#fff", borderRadius:14, width:460, maxWidth:"calc(100vw - 32px)",
                    maxHeight:"90vh", display:"flex", flexDirection:"column",
                    boxShadow:"0 20px 60px rgba(0,0,0,.3)", overflow:"hidden" }}>
        <div style={{ padding:"14px 20px", background:"#1a3a2a", flexShrink:0,
                      display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <div style={{ color:"#fff", fontWeight:700, fontSize:15 }}>👥 Staff</div>
          <button onClick={onClose} style={{ background:"rgba(255,255,255,.15)", border:"none", color:"#fff",
                   borderRadius:6, width:28, height:28, cursor:"pointer", fontSize:14 }}>✕</button>
        </div>

        <div style={{ overflowY:"auto", flex:1, padding:"16px 20px" }}>
          <div style={{ marginBottom:20 }}>
            <div style={{ fontSize:11, fontWeight:700, color:"#6b7280", textTransform:"uppercase",
                           letterSpacing:.5, marginBottom:8 }}>Managers (POC on printouts)</div>
            {managers.length === 0 && <div style={{ fontSize:12, color:"#d1d5db", fontStyle:"italic", marginBottom:6 }}>None added yet</div>}
            {managers.map(m => renderCard(m, "#f0fdf4", "#bbf7d0", "#1a3a2a"))}
          </div>

          <div style={{ marginBottom:20 }}>
            <div style={{ fontSize:11, fontWeight:700, color:"#6b7280", textTransform:"uppercase",
                           letterSpacing:.5, marginBottom:8 }}>Loaders</div>
            {loaders.length === 0 && <div style={{ fontSize:12, color:"#d1d5db", fontStyle:"italic", marginBottom:6 }}>None added yet</div>}
            {loaders.map(l => renderCard(l, "#fffbeb", "#fde68a", "#854d0e"))}
          </div>

          {/* Add new */}
          {!editingId && (
            <div style={{ borderTop:"1px solid #e5e7eb", paddingTop:16 }}>
              <div style={{ fontSize:11, fontWeight:700, color:"#6b7280", textTransform:"uppercase",
                             letterSpacing:.5, marginBottom:10 }}>Add Staff</div>
              <div style={{ display:"flex", gap:6, marginBottom:6 }}>
                <input value={form.name} onChange={e => set("name", e.target.value)}
                  placeholder="Name" style={{ flex:2, height:36, padding:"0 10px", border:"1px solid #e5e7eb", borderRadius:8, fontSize:13, outline:"none" }} />
                <input value={form.phone} onChange={e => set("phone", e.target.value)}
                  placeholder="Phone" style={{ flex:2, height:36, padding:"0 10px", border:"1px solid #e5e7eb", borderRadius:8, fontSize:13, outline:"none" }} />
              </div>
              <div style={{ display:"flex", gap:6, marginBottom:6 }}>
                <input value={form.email} onChange={e => set("email", e.target.value)}
                  placeholder="Email (optional)" style={{ flex:1, height:36, padding:"0 10px", border:"1px solid #e5e7eb", borderRadius:8, fontSize:13, outline:"none" }} />
                <input value={form.sport} onChange={e => set("sport", e.target.value)}
                  placeholder="Sport / team" style={{ flex:1, height:36, padding:"0 10px", border:"1px solid #e5e7eb", borderRadius:8, fontSize:13, outline:"none" }} />
              </div>
              <div style={{ display:"flex", gap:8, marginBottom:8 }}>
                {["manager","loader"].map(r => (
                  <button key={r} onClick={() => set("role", r)}
                    style={{ height:32, padding:"0 14px", borderRadius:8, fontSize:12, fontWeight:600, cursor:"pointer", border:"none",
                             background: form.role === r ? "#1a3a2a" : "#f3f4f6",
                             color: form.role === r ? "#fff" : "#374151" }}>
                    {r === "manager" ? "Manager" : "Loader"}
                  </button>
                ))}
              </div>
              {form.role === "loader" && (
                <div style={{ display:"flex", gap:8, marginBottom:8, flexWrap:"wrap" }}>
                  {SHIFT_LABELS.map((label, i) => (
                    <label key={i} style={{ display:"flex", alignItems:"center", gap:4, fontSize:12, cursor:"pointer" }}>
                      <input type="checkbox" checked={form.shifts.includes(i+1)} onChange={() => toggleShift(i+1)} />
                      {label}
                    </label>
                  ))}
                </div>
              )}
              {error && <div style={{ fontSize:11, color:"#dc2626", marginBottom:6 }}>⚠ {error}</div>}
              <button onClick={handleSave} disabled={saving}
                style={{ width:"100%", height:38, background: saving ? "#9ca3af" : "#1a3a2a",
                         color:"#fff", border:"none", borderRadius:8, fontSize:13, fontWeight:700, cursor:"pointer" }}>
                {saving ? "Saving…" : "Add"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Trip Load Row ─────────────────────────────────────────────────────────────
function TripLoadRow({ route, tripLabel, isNext, currentBagsInTruck, onEditBags, onMarkLoaded, onResetLoaded }) {
  const [inputBags, setInputBags] = useState("");
  const [error, setError]         = useState("");
  const [saving, setSaving]       = useState(false);
  const loaded     = route.is_loaded;
  const needed     = route.total_bags || 0;
  const bagsLoaded = route.bags_loaded ?? null;

  // How many additional bags need to be loaded: trip needs minus what's already in the truck
  const stillNeed  = needed - (currentBagsInTruck || 0);
  const noBagsNeeded = !loaded && isNext && stillNeed <= 0;

  const handleLoad = async () => {
    const entered = parseInt(inputBags, 10);
    if (isNaN(entered) || entered < 0) {
      setError("Please enter the number of bags loaded.");
      return;
    }
    setError("");
    setSaving(true);
    await onMarkLoaded(route.id, entered);
    setSaving(false);
  };

  return (
    <div style={{ padding:"14px 16px", borderTop:"1px solid #f3f4f6",
                  background: loaded ? "#f0fdf4" : isNext ? "#fffbeb" : "#fafafa",
                  borderLeft: isNext ? "4px solid #eab308" : "4px solid transparent" }}>
      {/* Trip label + stops row */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10 }}>
        <div>
          <span style={{ fontWeight:700, fontSize:13, color: loaded ? "#15803d" : "#374151",
                          fontFamily:"'DM Mono',monospace" }}>
            {tripLabel}
          </span>
          <span style={{ fontSize:11, color:"#9ca3af", marginLeft:10 }}>
            {route.total_stops} stops{route.driver_name ? ` · 👤 ${route.driver_name}` : ""}
          </span>
        </div>
        {loaded && (
          <button onClick={() => onResetLoaded(route.id)}
            style={{ padding:"3px 10px", background:"#fef2f2", color:"#dc2626",
                     border:"1px solid #fca5a5", borderRadius:6,
                     fontWeight:600, fontSize:11, cursor:"pointer" }}>
            ↺ Reset
          </button>
        )}
      </div>

      {/* Grid layout:
           Row 1: [🚛 26  ✎ Edit        ] [ Enter # Bags Loaded ]
           Row 2: [Trip 56] [Truck 30]    [ ✓ Mark Loaded       ]  */}
      {isNext && !loaded ? (
        <div style={{ display:"grid", gridTemplateColumns:"auto 1fr", gap:"6px 10px",
                      alignItems:"center", width:"100%", minWidth:0 }}>

          {/* Row 1 left: in-truck badge */}
          <div style={{ display:"flex", alignItems:"center", gap:6, padding:"5px 10px",
                         background:"rgba(0,0,0,.04)", borderRadius:8 }}>
            <span style={{ fontSize:13 }}>🚛</span>
            <span style={{ fontSize:26, fontWeight:800, color:"#374151",
                            fontFamily:"'DM Mono',monospace" }}>{currentBagsInTruck}</span>
            <span style={{ fontSize:11, color:"#9ca3af" }}>in truck</span>
            <button onClick={() => onEditBags?.()}
              style={{ marginLeft:8, height:24, padding:"0 10px", background:"#d0d6de",
                       color:"#2563eb", border:"1px solid #bfdbfe", borderRadius:6,
                       fontSize:11, fontWeight:600, cursor:"pointer" }}>
              ✎ Edit
            </button>
          </div>

          {/* Row 1 right: input box */}
          <div style={{ background:"#fff", border:`1.5px solid ${error ? "#ef4444" : "#e5e7eb"}`,
                         borderRadius:10, padding:"6px 10px", textAlign:"center" }}>
            <div style={{ fontSize:10, fontWeight:700, color:"#6b7280", textTransform:"uppercase",
                           letterSpacing:.5, marginBottom:2 }}>Enter # Bags Loaded</div>
            <input
              type="number" min="0" value={inputBags}
              onChange={e => { setInputBags(e.target.value); setError(""); }}
              onKeyDown={e => e.key === "Enter" && handleLoad()}
              placeholder="0"
              style={{ width:"100%", height:64, padding:"0 4px", border:"none", outline:"none",
                       fontSize:32, fontWeight:800, fontFamily:"'DM Mono',monospace",
                       textAlign:"center", background:"transparent", color:"#1a3a2a",
                       boxSizing:"border-box" }}
            />
          </div>

          {/* Row 2 left: Trip Needs + Truck Needs side by side */}
          <div style={{ display:"flex", gap:8 }}>
            <div style={{ background:"#fff", border:"2px solid #1a3a2a", borderRadius:10,
                          padding:"10px 14px", textAlign:"center", flex:1 }}>
              <div style={{ fontSize:10, fontWeight:700, color:"#6b7280",
                             textTransform:"uppercase", letterSpacing:.5, marginBottom:2 }}>Trip Needs</div>
              <div style={{ fontSize:28, fontWeight:800, color:"#1a3a2a",
                             fontFamily:"'DM Mono',monospace", lineHeight:1 }}>{needed}</div>
              <div style={{ fontSize:10, color:"#6b7280", marginTop:2 }}>bags</div>
            </div>
            <div style={{ background: noBagsNeeded ? "#f0fdf4" : "#fefce8",
                          border:`2px solid ${noBagsNeeded ? "#16a34a" : "#eab308"}`,
                          borderRadius:10, padding:"10px 14px", textAlign:"center", flex:1 }}>
              <div style={{ fontSize:10, fontWeight:700,
                             color: noBagsNeeded ? "#15803d" : "#713f12",
                             textTransform:"uppercase", letterSpacing:.5, marginBottom:2 }}>
                {noBagsNeeded ? "In Truck" : (/van/i.test(route.vehicle) ? "Van Needs" : "Truck Needs")}
              </div>
              <div style={{ fontSize:28, fontWeight:800,
                             color: noBagsNeeded ? "#15803d" : "#854d0e",
                             fontFamily:"'DM Mono',monospace", lineHeight:1 }}>
                {noBagsNeeded ? "—" : stillNeed}
              </div>
              <div style={{ fontSize:10, color: noBagsNeeded ? "#15803d" : "#854d0e", marginTop:2 }}>
                {noBagsNeeded ? "ok" : "bags"}
              </div>
            </div>
          </div>

          {/* Row 2 right: Mark Loaded button */}
          <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
            <button onClick={handleLoad} disabled={saving}
              style={{ width:"100%", height:38, background: saving ? "#9ca3af" : "#1a3a2a", color:"#fff",
                       border:"none", borderRadius:8, fontWeight:700, fontSize:13,
                       cursor: saving ? "default" : "pointer" }}>
              {saving ? "Saving…" : "✓ Mark Loaded"}
            </button>
            {error && <div style={{ fontSize:11, color:"#dc2626", fontWeight:600 }}>⚠ {error}</div>}
          </div>

        </div>

      ) : (
        /* Non-active trip or loaded state */
        <div style={{ display:"flex", gap:10, alignItems:"flex-start", marginBottom: loaded ? 0 : 8, flexWrap:"wrap" }}>
          {/* Trip Needs */}
          <div style={{ background: loaded ? "#f0fdf4" : "#fff",
                        border:`2px solid ${loaded ? "#16a34a" : "#1a3a2a"}`,
                        borderRadius:10, padding:"10px 16px", textAlign:"center", minWidth:96 }}>
            <div style={{ fontSize:10, fontWeight:700, color: loaded ? "#15803d" : "#6b7280",
                           textTransform:"uppercase", letterSpacing:.5, marginBottom:2 }}>Trip Needs</div>
            <div style={{ fontSize:28, fontWeight:800, color: loaded ? "#15803d" : "#1a3a2a",
                           fontFamily:"'DM Mono',monospace", lineHeight:1 }}>{needed}</div>
            <div style={{ fontSize:10, color: loaded ? "#15803d" : "#6b7280", marginTop:2 }}>bags</div>
          </div>
          {loaded && (
            <div style={{ background:"#bbf7d0", border:"2px solid #16a34a", borderRadius:10,
                          padding:"10px 16px", textAlign:"center", minWidth:96 }}>
              <div style={{ fontSize:10, fontWeight:700, color:"#15803d", textTransform:"uppercase",
                             letterSpacing:.5, marginBottom:2 }}>✓ Loaded</div>
              <div style={{ fontSize:28, fontWeight:800, color:"#166534", fontFamily:"'DM Mono',monospace",
                             lineHeight:1 }}>{bagsLoaded ?? "✓"}</div>
              <div style={{ fontSize:10, color:"#15803d", marginTop:2 }}>
                {trips.some(r => r.status === "in_progress") ? "bags remaining" : "bags"}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}


// ── Loader View (PIN-free, accessed via ?view=loading) ───────────────────────
function LoaderView({ routes, vehicles, staff, stopsByRoute, onMarkLoaded, onResetLoaded, onUpdateCurrentBags }) {
  const [activeShift, setActiveShift] = useState(0);
  const SHIFT_LABELS = ["Shift 1 (7:30am)", "Shift 2 (10:30am)", "Shift 3 (1:30pm)"];
  const SHIFT_COLORS = ["#1a3a2a", "#2563eb", "#7c3aed"];

  const shiftRoutes = routes.filter(r => r.shift_num === activeShift + 1);
  const groups = [...shiftRoutes].sort((a, b) => {
    const aIsVan = /van/i.test(a.vehicle), bIsVan = /van/i.test(b.vehicle);
    if (aIsVan !== bIsVan) return aIsVan ? 1 : -1;
    return a.vehicle.localeCompare(b.vehicle, undefined, { numeric: true });
  });

  const groupMap = new Map();
  for (const r of groups) {
    const base = getVehicleBase(r.vehicle);
    if (!groupMap.has(base)) groupMap.set(base, []);
    groupMap.get(base).push(r);
  }

  const loaders = (staff || []).filter(s => s.role === "loader" && (s.shifts || []).includes(activeShift + 1));

  return (
    <div style={{ minHeight:"100vh", background:"#f4f6f8", display:"flex", flexDirection:"column" }}>
      <style>{css}</style>

      {/* Header */}
      <div style={{ background:"#1a3a2a", padding:"12px 16px", position:"sticky", top:0, zIndex:10 }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <div>
            <div style={{ color:"#4ade80", fontSize:11, fontWeight:700, letterSpacing:.5, textTransform:"uppercase" }}>
              Loading
            </div>
            <div style={{ color:"#fff", fontWeight:700, fontSize:16 }}>🌿 AEHS Mulch 2026</div>
          </div>
          {loaders.length > 0 && (
            <div style={{ textAlign:"right" }}>
              {loaders.map(l => (
                <div key={l.id} style={{ color:"rgba(255,255,255,.75)", fontSize:11 }}>
                  {l.name}{l.phone ? ` · ${fmtPhone(l.phone)}` : ""}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Shift selector */}
      <div style={{ padding:"12px 16px 0", display:"flex", gap:8 }}>
        {SHIFT_LABELS.map((label, i) => {
          const sr = routes.filter(r => r.shift_num === i + 1);
          const done = sr.filter(r => r.is_loaded).length;
          return (
            <button key={i} onClick={() => setActiveShift(i)}
              style={{ flex:1, padding:"8px 6px", border:`2px solid ${SHIFT_COLORS[i]}`,
                       borderRadius:10, background: activeShift===i ? SHIFT_COLORS[i] : "#fff",
                       color: activeShift===i ? "#fff" : "#374151",
                       fontWeight:600, fontSize:12, cursor:"pointer" }}>
              <div>{label.split(" ")[0]} {label.split(" ")[1]}</div>
              <div style={{ fontSize:10, opacity:.8, marginTop:1 }}>{done}/{sr.length}</div>
            </button>
          );
        })}
      </div>

      {/* Vehicle tiles */}
      <div style={{ padding:12, display:"flex", flexDirection:"column", gap:10, flex:1 }}>
        {[...groupMap.entries()].map(([base, trips]) => (
          <LoadingVehicleTile key={base} base={base} trips={trips} vehicles={vehicles}
            stopsByRoute={stopsByRoute}
            onMarkLoaded={onMarkLoaded} onResetLoaded={onResetLoaded}
            onUpdateCurrentBags={onUpdateCurrentBags} />
        ))}
        {groups.length === 0 && (
          <div style={{ textAlign:"center", padding:"40px 20px", color:"#9ca3af", fontSize:13 }}>
            No routes for this shift.
          </div>
        )}
      </div>
    </div>
  );
}

// ── Loading Tab ──────────────────────────────────────────────────────────────
function LoadingTab({ routes, vehicles, staff, stopsByRoute, onMarkLoaded, onResetLoaded, onUpdateCurrentBags }) {
  const [activeShift, setActiveShift] = useState(0);
  const [plateSearch, setPlateSearch] = useState("");
  const SHIFT_LABELS = ["Shift 1 (7:30am)", "Shift 2 (10:30am)", "Shift 3 (1:30pm)"];
  const SHIFT_COLORS = ["#1a3a2a", "#2563eb", "#7c3aed"];

  const shiftRoutes = routes.filter(r => r.shift_num === activeShift + 1);

  // One tile per trip
  const groups = [...shiftRoutes].sort((a, b) => {
    const aIsVan = /van/i.test(a.vehicle), bIsVan = /van/i.test(b.vehicle);
    if (aIsVan !== bIsVan) return aIsVan ? 1 : -1;
    return a.vehicle.localeCompare(b.vehicle, undefined, { numeric: true });
  });

  const q             = plateSearch.trim().toUpperCase();
  const displayGroups = q
    ? routes.filter(r => {
        const base  = r.vehicle.replace(/\s*[Tt]rip\s*\d+/g, "").trim();
        const plate = vehicles?.[base] || "";
        return plate.toUpperCase().startsWith(q);
      })
    : groups;
  // Count unique vehicle bases for progress (not individual trips)
  const vehicleBases  = [...new Set(displayGroups.map(r => getVehicleBase(r.vehicle)))];
  const totalVehicles = vehicleBases.length;
  const loadedCount   = vehicleBases.filter(b =>
    displayGroups.filter(r => getVehicleBase(r.vehicle) === b).every(r => r.is_loaded)
  ).length;

  const loadingUrl = `${window.location.origin}?view=loading`;

  const [showQrModal, setShowQrModal]   = useState(false);
  const [preloading, setPreloading]     = useState(false);
  const [copiedLink, setCopiedLink]     = useState(false);

  const handlePreload = async () => {
    const shiftNum = activeShift + 1;
    // Find all Trip 1 routes for this shift that aren't already loaded
    // Match 'Trip 1' (multi-trip) OR no trip number (single-trip vehicles)
    const trip1s = routes.filter(r =>
      r.shift_num === shiftNum &&
      (r.vehicle.match(/Trip.?1/i) || !r.vehicle.match(/Trip.?\d+/i)) &&
      !r.is_loaded
    );
    if (trip1s.length === 0) {
      alert(`All Shift ${shiftNum} Trip 1 routes are already loaded.`);
      return;
    }
    const ok = window.confirm(
      `This will preload all Shift ${shiftNum} Trip 1 routes (${trip1s.length} vehicles) to their maximum bag capacity and mark them as loaded.

Continue?`
    );
    if (!ok) return;
    setPreloading(true);
    await Promise.all(trip1s.map(r => {
      const isVan = /van/i.test(r.vehicle);
      const maxCap = isVan ? 60 : 120;
      return onMarkLoaded(r.id, maxCap);
    }));
    setPreloading(false);
  };

  return (
    <div>
      {/* Loading page link + QR modal + Preload */}
        <div style={{ display:"flex", gap:8, alignItems:"center", marginBottom:10, flexWrap:"wrap" }}>
          <div style={{ fontSize:12, color:"#6b7280", flex:1 }}>
            Loaders can scan the QR or open this link — no PIN required.
          </div>
          {/* QR button */}
          <button onClick={() => setShowQrModal(true)}
            style={{ padding:"6px 12px", background:"#1a3a2a", color:"#fff", borderRadius:8,
                     fontSize:12, fontWeight:600, cursor:"pointer", whiteSpace:"nowrap", border:"none" }}>
            🔲 QR Code
          </button>
          {/* Preload button */}
          <button onClick={handlePreload} disabled={preloading}
            style={{ padding:"6px 12px", background:"#2563eb", color:"#fff", border:"none",
                     borderRadius:8, fontSize:12, fontWeight:600, cursor:"pointer", whiteSpace:"nowrap" }}>
            {preloading ? "Loading…" : "⚡ Preload"}
          </button>
        </div>

        {/* QR modal */}
        {showQrModal && (
          <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.55)", zIndex:300,
                        display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}
               onClick={() => setShowQrModal(false)}>
            <div onClick={e => e.stopPropagation()}
                 style={{ background:"#fff", borderRadius:14, padding:24, textAlign:"center",
                          boxShadow:"0 20px 60px rgba(0,0,0,.3)", maxWidth:280, width:"100%" }}>
              <div style={{ fontWeight:700, fontSize:15, marginBottom:12, color:"#111827" }}>
                Loading Page QR
              </div>
              <img src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(loadingUrl)}`}
                   alt="QR Code" style={{ width:200, height:200, borderRadius:8, marginBottom:12 }} />
              <a href={loadingUrl} target="_blank" rel="noreferrer"
                 style={{ display:"block", fontSize:12, color:"#2563eb", wordBreak:"break-all",
                          textDecoration:"underline", marginBottom:12 }}>
                {loadingUrl}
              </a>
              <button onClick={() => {
                navigator.clipboard.writeText(loadingUrl);
                setCopiedLink(true);
                setTimeout(() => setCopiedLink(false), 2000);
              }}
                style={{ width:"100%", height:36, background:"#f3f4f6", color:"#374151",
                         border:"1px solid #e5e7eb", borderRadius:8, fontSize:12,
                         fontWeight:600, cursor:"pointer", marginBottom:8 }}>
                {copiedLink ? "✓ Copied!" : "📋 Copy Link"}
              </button>
              <button onClick={() => setShowQrModal(false)}
                style={{ width:"100%", height:36, background:"#1a3a2a", color:"#fff",
                         border:"none", borderRadius:8, fontSize:12, fontWeight:600,
                         cursor:"pointer" }}>
                Close
              </button>
            </div>
          </div>
        )}

      {/* Shift selector */}
      <div style={{ display:"flex", gap:8, marginBottom:14, flexWrap:"wrap" }}>
        {SHIFT_LABELS.map((label, i) => {
          const sr   = routes.filter(r => r.shift_num === i + 1);
          const done  = sr.filter(r => r.is_loaded).length;
          const total = sr.length;
          return (
            <button key={i} onClick={() => setActiveShift(i)}
              style={{ flex:"1 1 0", padding:"10px 14px", border:`2px solid ${SHIFT_COLORS[i]}`,
                       borderRadius:10, background: activeShift===i ? SHIFT_COLORS[i] : "#fff",
                       color: activeShift===i ? "#fff" : "#374151",
                       fontWeight:600, fontSize:13, cursor:"pointer" }}>
              <div>{label.split(" ")[0]} {label.split(" ")[1]}</div>
              <div style={{ fontSize:11, opacity:.8, fontWeight:400, marginTop:2 }}>
                {done}/{total} loaded
              </div>
            </button>
          );
        })}
      </div>

      {/* Loaders for active shift */}
      {(() => {
        const loaders = (staff || []).filter(s => s.role === "loader" && (s.shifts || []).includes(activeShift + 1));
        if (!loaders.length) return null;
        const loadingUrl = `${window.location.origin}?view=loading`;
        return (
          <div style={{ marginBottom:10 }}>

            <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
              {loaders.map(l => {
                const digits = (l.phone || "").replace(/\D/g, "");
                const smsBody = `Hi ${l.name.split(" ")[0]}, here is the AEHS Mulch loading page for your shift: ${loadingUrl}`;
                return (
                  <div key={l.id} style={{ display:"flex", alignItems:"center", gap:5,
                                            background:"#f0fdf4", border:"1px solid #bbf7d0",
                                            borderRadius:8, padding:"3px 8px" }}>
                    <span style={{ fontSize:11, color:"#15803d", fontWeight:600 }}>
                      {l.name}{l.phone ? <> · <PhoneLink phone={l.phone} style={{ fontSize:"inherit" }} /></> : ""}
                    </span>
                    {digits.length >= 10 && (
                      <a href={`sms:${digits}?body=${encodeURIComponent(smsBody)}`}
                         title={`Text loading link to ${l.name}`}
                         style={{ width:22, height:22, borderRadius:5, background:"#22c55e",
                                  color:"#fff", textDecoration:"none", fontSize:12,
                                  display:"flex", alignItems:"center", justifyContent:"center",
                                  flexShrink:0 }}>
                        💬
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Progress bar */}
      <div style={{ background:"#f3f4f6", borderRadius:8, height:8, marginBottom:16, overflow:"hidden" }}>
        <div style={{ height:"100%", borderRadius:8, background:"#15803d",
                      width: totalVehicles ? `${(loadedCount/totalVehicles)*100}%` : "0%",
                      transition:"width .3s" }} />
      </div>
      <div style={{ fontSize:12, color:"#6b7280", marginBottom:16, textAlign:"center" }}>
        {loadedCount} of {totalVehicles} vehicles loaded this shift
      </div>

      {/* Plate search */}
      <div style={{ position:"relative", marginBottom:12 }}>
        <span style={{ position:"absolute", left:12, top:"50%", transform:"translateY(-50%)",
                       fontSize:16, pointerEvents:"none" }}>🔍</span>
        <input
          value={plateSearch}
          onChange={e => setPlateSearch(e.target.value.toUpperCase())}
          placeholder="Search by license plate…"
          style={{ width:"100%", height:40, padding:"0 36px 0 38px", border:"1px solid #e5e7eb",
                   borderRadius:10, fontSize:14, outline:"none", background:"#fff",
                   fontFamily:"'DM Mono',monospace", letterSpacing:1, boxSizing:"border-box",
                   textTransform:"uppercase" }}
        />
        {plateSearch && (
          <button onClick={() => setPlateSearch("")}
            style={{ position:"absolute", right:10, top:"50%", transform:"translateY(-50%)",
                     background:"none", border:"none", fontSize:16, cursor:"pointer",
                     color:"#9ca3af", lineHeight:1 }}>✕</button>
        )}
      </div>
      {q && (
        <div style={{ fontSize:12, color:"#6b7280", marginBottom:8 }}>
          {displayGroups.length} trip{displayGroups.length!==1?"s":""} matching plate "{plateSearch}"
          {displayGroups.length > 0 && !groups.every(r => displayGroups.includes(r)) && (
            <span style={{ marginLeft:6, color:"#9ca3af" }}>— across all shifts</span>
          )}
        </div>
      )}

      {/* Vehicle tiles — grouped by base vehicle */}
      <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
        {(() => {
          const groupMap = new Map();
          for (const r of displayGroups) {
            const base = getVehicleBase(r.vehicle);
            if (!groupMap.has(base)) groupMap.set(base, []);
            groupMap.get(base).push(r);
          }
          return [...groupMap.entries()].map(([base, trips]) => {
            const plate     = vehicles?.[base] || "";
            const isVan     = /van/i.test(base);
            const color     = isVan ? "#1d4ed8" : "#15803d";
            const bgColor   = isVan ? "#eff6ff" : "#f0fdf4";
            const border    = isVan ? "#bfdbfe" : "#bbf7d0";
            const allLoaded = trips.every(r => r.is_loaded);
            const totalBags = trips.reduce((s, r) => s + (r.total_bags || 0), 0);
            const shiftRef  = trips[0];
            const sc = [
              { bg:"#1a3a2a", text:"#fff" },
              { bg:"#2563eb", text:"#fff" },
              { bg:"#7c3aed", text:"#fff" },
            ][(shiftRef.shift_num || 1) - 1] || { bg:"#1a3a2a", text:"#fff" };

            return (
              <LoadingVehicleTile key={base} base={base} trips={trips} vehicles={vehicles}
                stopsByRoute={stopsByRoute}
                onMarkLoaded={onMarkLoaded} onResetLoaded={onResetLoaded}
                onUpdateCurrentBags={onUpdateCurrentBags} />
            );
          });
        })()}
      </div>

      {groups.length === 0 && (
        <div style={{ textAlign:"center", padding:"32px 20px", color:"#9ca3af", fontSize:13 }}>
          No routes for this shift.
        </div>
      )}
    </div>
  );
}

// ── Loading Vehicle Tile ──────────────────────────────────────────────────────
function LoadingVehicleTile({ base, trips, vehicles, stopsByRoute, onMarkLoaded, onResetLoaded, onUpdateCurrentBags }) {
  const [open, setOpen]         = useState(true);
  const [editingBags, setEditingBags] = useState(false);
  const [bagsDraft, setBagsDraft]     = useState("");
  const [savingBags, setSavingBags]   = useState(false);

  const vData     = vehicles?.[base];
  const plate     = vData?.plate ?? vData ?? "";
  const isVan     = /van/i.test(base);
  const color     = isVan ? "#1d4ed8" : "#15803d";
  const bgColor   = isVan ? "#eff6ff" : "#f0fdf4";
  const border    = isVan ? "#bfdbfe" : "#bbf7d0";
  const allLoaded = trips.every(r => r.is_loaded);
  const totalBags = trips.reduce((s, r) => s + (r.total_bags || 0), 0);
  const shiftRef  = trips[0];
  const sc = [
    { bg:"#1a3a2a", text:"#fff" },
    { bg:"#2563eb", text:"#fff" },
    { bg:"#7c3aed", text:"#fff" },
  ][(shiftRef.shift_num || 1) - 1] || { bg:"#1a3a2a", text:"#fff" };

  // Computed bags from trips
  const _tLoaded   = trips.filter(r => r.is_loaded).reduce((s, r) => s + (r.bags_loaded || 0), 0);
  // Use delivered stop bag counts for real-time accuracy
  const _tConsumed = trips.reduce((s, r) => {
    const stops = (stopsByRoute || {})[r.id] || [];
    const deliveredBags = stops
      .filter(st => st.status === "delivered" || st.status === "skipped")
      .reduce((a, st) => a + (st.bags || 0), 0);
    // Fall back to total_bags if stop-level bags not tracked
    if (stops.length > 0 && deliveredBags > 0) return s + deliveredBags;
    if (r.status === "complete") return s + (r.total_bags || 0);
    return s;
  }, 0);
  const computedBags = Math.max(0, _tLoaded - _tConsumed);
  // Override takes precedence if set
  const overrideBags = vData?.currentBags ?? null;
  const currentBagsInTruck = overrideBags !== null ? overrideBags : computedBags;

  const handleSaveBags = async () => {
    const n = parseInt(bagsDraft, 10);
    if (isNaN(n) || n < 0) return;
    setSavingBags(true);
    await onUpdateCurrentBags?.(base, n);
    setSavingBags(false);
    setEditingBags(false);
  };

  return (
              <div key={base}
                style={{ background: allLoaded ? "#f9fafb" : "#fff",
                         border:`1.5px solid ${allLoaded ? "#d1d5db" : border}`,
                         borderRadius:12, overflow:"hidden",
                         opacity: allLoaded ? 0.75 : 1,
                         transition:"all .2s", boxShadow:"0 1px 4px rgba(0,0,0,.06)" }}>

                {/* Vehicle header — click to collapse/expand */}
                <div style={{ padding:"14px 16px", display:"flex", alignItems:"center", gap:12,
                              cursor:"pointer" }}
                     onClick={() => setOpen(o => !o)}>
                  <div style={{ width:48, height:48, borderRadius:12, flexShrink:0,
                                 background: allLoaded ? "#f3f4f6" : bgColor,
                                 display:"flex", alignItems:"center", justifyContent:"center", fontSize:24 }}>
                    {isVan ? "🚐" : "🚛"}
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    {plate ? (
                      <>
                        <LicensePlate plate={plate} size="md" />
                        <div style={{ fontSize:12, fontWeight:600, color: allLoaded ? "#c4c4c4" : "#9ca3af",
                                      fontFamily:"'DM Mono',monospace", marginTop:4 }}>
                          {base}
                        </div>
                      </>
                    ) : (
                      <div style={{ fontWeight:800, fontSize:16, color: allLoaded ? "#9ca3af" : "#111827",
                                    fontFamily:"'DM Mono',monospace" }}>
                        {base}
                      </div>
                    )}
                    <div style={{ display:"flex", gap:8, alignItems:"center", marginTop:4, flexWrap:"wrap" }}>
                      <div style={{ display:"flex", alignItems:"baseline", gap:4 }}>
                        <span style={{ fontWeight:800, fontSize:22,
                                        color: allLoaded ? "#9ca3af" : currentBagsInTruck > 0 ? color : "#9ca3af",
                                        fontFamily:"'DM Mono',monospace" }}>
                          {currentBagsInTruck.toLocaleString()}
                        </span>
                        <span style={{ fontSize:11, color:"#9ca3af" }}>bags in truck</span>
                        {overrideBags !== null && (
                          <span style={{ fontSize:9, color:"#f59e0b", fontWeight:700, marginLeft:2 }}>✎ edited</span>
                        )}
                      </div>
                      <span style={{ fontSize:11, color:"#d1d5db" }}>·</span>
                      <span style={{ fontSize:11, color:"#6b7280" }}>
                        {trips.length} trip{trips.length !== 1 ? "s" : ""}
                        <span style={{ fontWeight:700, marginLeft:4 }}>{totalBags.toLocaleString()} bags total</span>
                      </span>
                      <span style={{ fontSize:11, fontWeight:700, padding:"2px 8px", borderRadius:8,
                                     background: allLoaded ? "#f3f4f6" : sc.bg,
                                     color: allLoaded ? "#9ca3af" : sc.text }}>
                        {shiftRef.shift}
                      </span>
                    </div>
                  </div>
                  <span style={{ fontSize:16, color:"#9ca3af", flexShrink:0 }}>{open ? "▲" : "▼"}</span>
                </div>

                {/* Edit bags in truck row */}
                <div onClick={e => e.stopPropagation()}
                     style={{ padding:"8px 16px", borderTop:"1px solid #f3f4f6", background:"#fafafa",
                              display:"flex", alignItems:"center", gap:8 }}>
                  <span style={{ fontSize:12, color:"#6b7280", fontWeight:600, flex:1 }}>
                    Bags currently in truck:
                    <span style={{ fontFamily:"'DM Mono',monospace", fontWeight:800, color: color,
                                   marginLeft:6, fontSize:14 }}>
                      {currentBagsInTruck}
                    </span>
                  </span>
                  {editingBags ? (
                    <div style={{ display:"flex", gap:6, alignItems:"center" }}>
                      <input type="number" min="0" value={bagsDraft}
                        onChange={e => setBagsDraft(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") handleSaveBags(); if (e.key === "Escape") setEditingBags(false); }}
                        autoFocus
                        style={{ width:72, height:32, padding:"0 8px", border:"1.5px solid #1a3a2a",
                                 borderRadius:7, fontSize:15, fontWeight:700, outline:"none",
                                 fontFamily:"'DM Mono',monospace", textAlign:"center" }} />
                      <button onClick={() => setEditingBags(false)}
                        style={{ height:32, padding:"0 8px", border:"1px solid #e5e7eb", borderRadius:7,
                                 background:"#f9fafb", fontSize:12, cursor:"pointer" }}>✕</button>
                      <button onClick={handleSaveBags} disabled={savingBags}
                        style={{ height:32, padding:"0 10px", background:"#1a3a2a", color:"#fff",
                                 border:"none", borderRadius:7, fontSize:12, fontWeight:700, cursor:"pointer" }}>
                        {savingBags ? "…" : "✓"}
                      </button>
                    </div>
                  ) : (
                    <button onClick={() => { setBagsDraft(String(currentBagsInTruck)); setEditingBags(true); }}
                      style={{ height:30, padding:"0 10px", background:"#eff6ff", color:"#2563eb",
                               border:"1px solid #bfdbfe", borderRadius:7, fontSize:11,
                               fontWeight:600, cursor:"pointer", whiteSpace:"nowrap" }}>
                      ✎ Edit
                    </button>
                  )}
                </div>

                {/* Per-trip rows — collapsible */}
                {open && (() => {
                  const nextIdx = trips.findIndex(r => !r.is_loaded);
                  return trips.map((r, i) => (
                    <TripLoadRow key={r.id} route={r} tripLabel={trips.length === 1 ? r.vehicle : `Trip ${i + 1}`}
                      isNext={i === nextIdx}
                      currentBagsInTruck={currentBagsInTruck}
                      onEditBags={() => { setBagsDraft(String(currentBagsInTruck)); setEditingBags(true); setOpen(true); }}
                      onMarkLoaded={onMarkLoaded} onResetLoaded={onResetLoaded} />
                  ));
                })()}
              </div>
  );
}

// ── Vehicles Tab ─────────────────────────────────────────────────────────────
function VehiclesTab({ routes, vehicles, onSave, onResetAll }) {
  const vehicleNames = [...new Set(routes.map(r => getVehicleBase(r.vehicle)))].sort((a, b) => {
    const aIsVan = /van/i.test(a), bIsVan = /van/i.test(b);
    if (aIsVan !== bIsVan) return aIsVan ? 1 : -1;
    const numA = parseInt((a.match(/\d+/) || [0])[0]);
    const numB = parseInt((b.match(/\d+/) || [0])[0]);
    return numA - numB;
  });

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
        <div style={{ fontSize:13, color:"#6b7280" }}>
          Enter or scan license plates. Saved instantly to the database.
        </div>
        <button onClick={onResetAll}
          style={{ background:"#fee2e2", color:"#dc2626", border:"1px solid #fca5a5",
                   borderRadius:6, padding:"4px 12px", fontSize:12, fontWeight:600,
                   cursor:"pointer", flexShrink:0, marginLeft:12 }}>
          Reset All
        </button>
      </div>
      <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
        {vehicleNames.map(name => (
          <VehicleTile key={name} vehicleName={name}
            plate={vehicles[name]?.plate ?? vehicles[name] ?? ""}
            onSave={(plate) => onSave(name, plate)} />
        ))}
      </div>
      {vehicleNames.length === 0 && (
        <div style={{ textAlign:"center", padding:"32px 20px", color:"#9ca3af", fontSize:13 }}>
          No vehicles found. Run the optimizer first to generate routes.
        </div>
      )}
    </div>
  );
}

function VehicleTile({ vehicleName, plate, onSave }) {
  const [editing, setEditing]     = useState(false);
  const [draft, setDraft]         = useState(plate);
  const [scanning, setScanning]   = useState(false);
  const [scanMsg, setScanMsg]     = useState("");
  const [saving, setSaving]       = useState(false);
  const videoRef  = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);

  // Sync draft when plate prop changes from an external real-time update
  useEffect(() => {
    if (!editing) setDraft(plate);
  }, [plate]);

  const isVan   = /van/i.test(vehicleName);
  const icon    = isVan ? "🚐" : "🚛";
  const color   = isVan ? "#1d4ed8" : "#15803d";
  const bgColor = isVan ? "#eff6ff" : "#f0fdf4";
  const border  = isVan ? "#bfdbfe" : "#bbf7d0";

  const stopStream = () => {
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
    if (videoRef.current) videoRef.current.srcObject = null;
  };

  const startCamera = async () => {
    setScanMsg(""); setScanning(true); setEditing(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 } }
      });
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play(); }
    } catch {
      setScanMsg("Camera access denied — enter plate manually."); setScanning(false);
    }
  };

  const captureAndRead = async () => {
    if (!videoRef.current || !canvasRef.current) return;
    const v = videoRef.current, c = canvasRef.current;
    c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext("2d").drawImage(v, 0, 0);
    const base64 = c.toDataURL("image/jpeg", 0.92).split(",")[1];
    stopStream(); setScanning(false); setScanMsg("Reading plate…");
    try {
      const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514", max_tokens: 50,
          messages: [{ role: "user", content: [
            { type: "image", source: { type: "base64", media_type: "image/jpeg", data: base64 }},
            { type: "text",  text: "Read the license plate in this photo. Reply with ONLY the plate characters (letters and numbers), nothing else. If unclear, reply UNKNOWN." }
          ]}]
        })
      });
      const data = await resp.json();
      const text = (data.content?.[0]?.text || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (text && text !== "UNKNOWN") {
        setScanMsg(""); setDraft(text); setSaving(true);
        await onSave(text); setSaving(false); setEditing(false);
      } else {
        setScanMsg("Could not read plate — enter manually."); setEditing(true);
      }
    } catch { setScanMsg("Scan failed — enter manually."); setEditing(true); }
  };

  const handleSave = async () => {
    setSaving(true);
    await onSave(draft.trim().toUpperCase());
    setSaving(false); setEditing(false); setScanMsg("");
  };

  return (
    <div style={{ background:"#fff", border:`1px solid ${border}`, borderRadius:12,
                  padding:"14px 16px", boxShadow:"0 1px 4px rgba(0,0,0,.06)" }}>
      <div style={{ display:"flex", alignItems:"center", gap:10 }}>
        <div style={{ width:40, height:40, borderRadius:10, background:bgColor, flexShrink:0,
                       display:"flex", alignItems:"center", justifyContent:"center", fontSize:20 }}>
          {icon}
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontWeight:700, fontSize:15 }}>{vehicleName}</div>
          {plate && !editing
            ? <LicensePlate plate={plate} size="md" />
            : !editing && <div style={{ fontSize:12, color:"#d1d5db", fontStyle:"italic" }}>No plate entered</div>}
        </div>
        <div style={{ display:"flex", gap:6, flexShrink:0 }}>
          <button onClick={startCamera} title="Scan with camera"
            style={{ width:36, height:36, border:"1px solid #e5e7eb", borderRadius:8,
                     background:"#f9fafb", fontSize:18, cursor:"pointer" }}>📷</button>
          <button onClick={() => { setDraft(plate); setEditing(true); setScanMsg(""); stopStream(); setScanning(false); }}
            title="Enter manually"
            style={{ width:36, height:36, border:`1px solid ${color}44`, borderRadius:8,
                     background:bgColor, fontSize:14, cursor:"pointer", color }}>✏️</button>
          {plate && (
            <button onClick={async () => {
              if (!window.confirm(`Clear plate for ${vehicleName}?`)) return;
              setDraft(""); setScanMsg(""); setEditing(false);
              await onSave("");
            }} title="Clear plate"
              style={{ width:36, height:36, border:"1px solid #fca5a5", borderRadius:8,
                       background:"#fef2f2", fontSize:14, cursor:"pointer", color:"#dc2626" }}>✕</button>
          )}
        </div>
      </div>

      {plate && !editing && !scanning && !scanMsg && (
        <div style={{ display:"flex", alignItems:"center", gap:8, marginTop:8,
                      padding:"5px 10px", background:"#f0fdf4", borderRadius:6, border:"1px solid #bbf7d0" }}>
          <span style={{ fontSize:11, color:"#15803d", fontWeight:700 }}>✓ SAVED</span>
          <LicensePlate plate={plate} size="sm" />
        </div>
      )}

      {scanning && (
        <div style={{ marginTop:10 }}>
          <video ref={videoRef} autoPlay playsInline muted
            style={{ width:"100%", borderRadius:8, background:"#000", maxHeight:220, objectFit:"cover" }} />
          <canvas ref={canvasRef} style={{ display:"none" }} />
          <div style={{ display:"flex", gap:8, marginTop:8 }}>
            <button onClick={() => { stopStream(); setScanning(false); }}
              style={{ flex:1, height:38, border:"1px solid #e5e7eb", borderRadius:8, background:"#f9fafb", fontSize:13 }}>
              Cancel
            </button>
            <button onClick={captureAndRead}
              style={{ flex:2, height:38, background:"#1a3a2a", color:"#fff", border:"none", borderRadius:8, fontSize:13, fontWeight:700 }}>
              📸 Capture Plate
            </button>
          </div>
        </div>
      )}

      {scanMsg && (
        <div style={{ fontSize:12, marginTop:6, padding:"6px 10px", borderRadius:6,
                      color: scanMsg.includes("Reading") ? "#2563eb" : "#dc2626",
                      background: scanMsg.includes("Reading") ? "#eff6ff" : "#fef2f2" }}>
          {scanMsg}
        </div>
      )}

      {editing && !scanning && (
        <div style={{ display:"flex", gap:8, marginTop:10 }}>
          <input value={draft} onChange={e => setDraft(e.target.value.toUpperCase())}
            placeholder="e.g. ABC1234" maxLength={10} autoFocus
            onKeyDown={e => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") setEditing(false); }}
            style={{ flex:1, height:40, padding:"0 12px", border:`1px solid ${color}66`, borderRadius:8,
                     fontSize:15, fontFamily:"'DM Mono',monospace", letterSpacing:2,
                     outline:"none", textTransform:"uppercase" }} />
          <button onClick={() => setEditing(false)}
            style={{ width:40, height:40, border:"1px solid #e5e7eb", borderRadius:8, background:"#f9fafb" }}>✕</button>
          <button onClick={handleSave} disabled={saving}
            style={{ width:40, height:40, background:"#1a3a2a", color:"#fff", border:"none", borderRadius:8, fontWeight:700 }}>
            {saving ? "…" : "✓"}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Drivers Tab ──────────────────────────────────────────────────────────────
function DriverCard({ d, assigned, onUpdate }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm]       = useState({});
  const [saving, setSaving]   = useState(false);
  const SHIFT_LABELS = { 1: "Shift 1 (7:30)", 2: "Shift 2 (10:30)", 3: "Shift 3 (1:30)" };

  const startEdit = () => {
    setForm({
      firstName:   d.firstName,
      lastName:    d.lastName,
      phone:       d.phone || "",
      email:       d.email || "",
      sport:       d.sport || d.signups[0]?.sport || "",
      vehiclePref: d.vehiclePref || "both",
    });
    setEditing(true);
  };

  const handleSave = async () => {
    setSaving(true);
    await onUpdate(d.id, form);
    setSaving(false);
    setEditing(false);
  };

  const fullName = `${d.firstName} ${d.lastName}`;
  const sport = d.sport || d.signups[0]?.sport || "";

  if (editing) {
    return (
      <div style={{ background:"#fff", border:"1.5px solid #1a3a2a", borderRadius:10, padding:"12px 14px" }}>
        <div style={{ fontSize:11, fontWeight:700, color:"#6b7280", textTransform:"uppercase",
                       letterSpacing:.5, marginBottom:8 }}>Edit Driver</div>
        <div style={{ display:"flex", gap:6, marginBottom:6 }}>
          <input value={form.firstName} onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))}
            placeholder="First name"
            style={{ flex:1, height:34, padding:"0 8px", border:"1px solid #e5e7eb", borderRadius:7, fontSize:12, outline:"none" }} />
          <input value={form.lastName} onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))}
            placeholder="Last name"
            style={{ flex:1, height:34, padding:"0 8px", border:"1px solid #e5e7eb", borderRadius:7, fontSize:12, outline:"none" }} />
        </div>
        <div style={{ display:"flex", gap:6, marginBottom:6 }}>
          <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
            placeholder="Phone"
            style={{ flex:1, height:34, padding:"0 8px", border:"1px solid #e5e7eb", borderRadius:7, fontSize:12, outline:"none" }} />
          <input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
            placeholder="Email"
            style={{ flex:1, height:34, padding:"0 8px", border:"1px solid #e5e7eb", borderRadius:7, fontSize:12, outline:"none" }} />
        </div>
        <input value={form.sport} onChange={e => setForm(f => ({ ...f, sport: e.target.value }))}
          placeholder="Sport / team (comma-separated)"
          style={{ width:"100%", height:34, padding:"0 8px", border:"1px solid #e5e7eb", borderRadius:7,
                   fontSize:12, outline:"none", boxSizing:"border-box", marginBottom:8 }} />
        <div style={{ marginBottom:8 }}>
          <div style={{ fontSize:11, color:"#6b7280", marginBottom:5 }}>Vehicle preference</div>
          <div style={{ display:"flex", gap:6 }}>
            {[["both","🚛🚐 Both"],["truck","🚛 Truck only"],["van","🚐 Van only"]].map(([val, label]) => (
              <button key={val} onClick={() => setForm(f => ({ ...f, vehiclePref: val }))}
                style={{ flex:1, height:32, borderRadius:7, border:"none", fontSize:11, fontWeight:600,
                         cursor:"pointer",
                         background: form.vehiclePref === val ? "#1a3a2a" : "#f3f4f6",
                         color: form.vehiclePref === val ? "#fff" : "#374151" }}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <div style={{ display:"flex", gap:6 }}>
          <button onClick={() => setEditing(false)}
            style={{ flex:1, height:32, border:"1px solid #9ca3af", borderRadius:7,
                     background:"#f3f4f6", color:"#374151", fontSize:12, fontWeight:600, cursor:"pointer" }}>
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving}
            style={{ flex:2, height:32, background: saving ? "#9ca3af" : "#1a3a2a", color:"#fff",
                     border:"none", borderRadius:7, fontSize:12, fontWeight:700, cursor:"pointer" }}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    );
  }

  const vpLabel = d.vehiclePref === "truck" ? "🚛 Truck only" : d.vehiclePref === "van" ? "🚐 Van only" : null;

  return (
    <div style={{ background:"#d0d6de", border:"none", borderRadius:0,
                   padding:"12px 14px", display:"flex", gap:10, alignItems:"flex-start" }}>
      <div style={{ width:36, height:36, borderRadius:"50%", flexShrink:0,
                     background: assigned ? "#dcfce7" : "#f3f4f6",
                     display:"flex", alignItems:"center", justifyContent:"center",
                     fontSize:14, fontWeight:700, color: assigned ? "#15803d" : "#6b7280" }}>
        {d.firstName[0]}{d.lastName[0]}
      </div>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontWeight:700, fontSize:14 }}>{fullName}
          {assigned && (
            <span style={{ marginLeft:8, background:"#dcfce7", color:"#15803d",
                            fontSize:10, padding:"1px 7px", borderRadius:8, fontWeight:600 }}>
              ✓ Assigned — {assigned.vehicle}
            </span>
          )}
        </div>
        {d.email && <div style={{ fontSize:11, color:"#6b7280", marginTop:1 }}>{d.email}</div>}
        {d.phone && <div style={{ marginTop:1 }}><PhoneLink phone={d.phone} style={{ fontSize:11 }} /></div>}
        <div style={{ display:"flex", flexWrap:"wrap", gap:4, marginTop:6 }}>
          {d.signups.map((s, i) => (
            <span key={i}
                  style={{ background: s.vehicleType === "van" ? "#d0d6de" : "#f0fdf4",
                           color: s.vehicleType === "van" ? "#1d4ed8" : "#15803d",
                           border:`1px solid ${s.vehicleType === "van" ? "#bfdbfe" : "#bbf7d0"}`,
                           fontSize:10, padding:"2px 8px", borderRadius:10, fontWeight:600 }}>
              {s.vehicleType === "van" ? "🚐" : "🚛"} {SHIFT_LABELS[s.shift_num]}
            </span>
          ))}
          {vpLabel && (
            <span style={{ background:"#f5f3ff", color:"#7c3aed", border:"1px solid #ddd6fe",
                            fontSize:10, padding:"2px 8px", borderRadius:10, fontWeight:600 }}>
              Pref: {vpLabel}
            </span>
          )}
        </div>
        {sport && (
          <div style={{ fontSize:11, color:"#2563eb", marginTop:4 }}>
            🏅 {sport.substring(0, 100)}{sport.length > 100 ? "…" : ""}
          </div>
        )}
      </div>
      <button onClick={startEdit}
        style={{ background:"#eff6ff", border:"1px solid #bfdbfe", color:"#2563eb",
                 borderRadius:6, padding:"3px 8px", fontSize:11, cursor:"pointer",
                 fontWeight:600, flexShrink:0 }}>✏️</button>
    </div>
  );
}

function DriversTab({ drivers, routes, onUpload, onClear, onUpdate }) {
  const fileRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFile = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => onUpload(e.target.result);
    reader.readAsText(file);
  };

  const assignmentMap = {};
  for (const r of routes) {
    if (r.driver_name) assignmentMap[r.driver_name] = r;
  }

  return (
    <div>
      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]); }}
        style={{ border:`2px dashed ${dragOver ? "#1a3a2a" : "#d1d5db"}`,
                 borderRadius:12, padding:"28px 20px", textAlign:"center",
                 background: dragOver ? "#f0fdf4" : "#fff", marginBottom:16,
                 transition:"all .15s", cursor:"pointer" }}
        onClick={() => fileRef.current?.click()}>
        <input ref={fileRef} type="file" accept=".csv" style={{ display:"none" }}
          onChange={e => handleFile(e.target.files[0])} />
        <div style={{ fontSize:32, marginBottom:8 }}>📋</div>
        <div style={{ fontWeight:700, fontSize:14, color:"#1a3a2a", marginBottom:4 }}>Upload SignUpGenius CSV</div>
        <div style={{ fontSize:12, color:"#9ca3af" }}>Drop file here or click to browse</div>
      </div>

      {drivers.length > 0 ? (
        <>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
            <div style={{ fontWeight:700, fontSize:14, color:"#111827" }}>{drivers.length} Drivers in Roster</div>
            <button onClick={() => { if (window.confirm("Clear driver roster?")) onClear(); }}
              style={{ background:"#fee2e2", color:"#dc2626", border:"1px solid #fca5a5",
                       borderRadius:6, padding:"4px 12px", fontSize:12, fontWeight:600, cursor:"pointer" }}>
              Clear Roster
            </button>
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            {drivers.map(d => (
              <DriverCard key={d.id} d={d} assigned={assignmentMap[`${d.firstName} ${d.lastName}`]} onUpdate={onUpdate} />
            ))}
          </div>
        </>
      ) : (
        <div style={{ textAlign:"center", padding:"32px 20px", color:"#9ca3af", fontSize:13 }}>
          No drivers loaded yet. Upload a SignUpGenius CSV to get started.
        </div>
      )}
    </div>
  );
}




// ── Clickable Phone Component ─────────────────────────────────────────────────
function PhoneLink({ phone, style = {} }) {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  const formatted = digits.replace(/^1?(\d{3})(\d{3})(\d{4})$/, "($1) $2-$3") || phone;
  return (
    <span style={{ display:"inline-flex", gap:6, alignItems:"center", ...style }}>
      <a href={`tel:${digits}`}
         onClick={e => e.stopPropagation()}
         style={{ color:"#374151", textDecoration:"none", fontSize:"inherit" }}>
        📞 {formatted}
      </a>
      <a href={`sms:${digits}`}
         onClick={e => e.stopPropagation()}
         style={{ fontSize:10, fontWeight:700, padding:"1px 6px", borderRadius:6,
                  background:"#dcfce7", color:"#166534", textDecoration:"none" }}>
        SMS
      </a>
    </span>
  );
}

// ── License Plate Component (Arizona) ───────────────────────────────────────
function LicensePlate({ plate, size = "md" }) {
  if (!plate) return null;
  const sizes = {
    sm: { w:82,  h:38,  font:9,  bold:13, r:5,  bolts:3, boltR:2   },
    md: { w:112, h:52,  font:11, bold:17, r:7,  bolts:4, boltR:2.5 },
    lg: { w:152, h:68,  font:14, bold:22, r:9,  bolts:5, boltR:3   },
  };
  const s = sizes[size] || sizes.md;
  const W = s.w, H = s.h;
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}
         xmlns="http://www.w3.org/2000/svg" style={{ display:"block", flexShrink:0 }}>
      <defs>
        {/* Arizona sky gradient: deep blue left → lighter right */}
        <linearGradient id={`azSky${size}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%"   stopColor="#1e3a8a"/>
          <stop offset="100%" stopColor="#3b82f6"/>
        </linearGradient>
        {/* Sunset band */}
        <linearGradient id={`azSun${size}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%"   stopColor="#f97316"/>
          <stop offset="50%"  stopColor="#ef4444"/>
          <stop offset="100%" stopColor="#c026d3"/>
        </linearGradient>
      </defs>

      {/* Plate body — white */}
      <rect x="0" y="0" width={W} height={H} rx={s.r} ry={s.r}
            fill="#ffffff" stroke="#94a3b8" strokeWidth="1.5"/>

      {/* Sky bar top ~30% */}
      <rect x="0" y="0" width={W} height={H*0.32} rx={s.r} ry={s.r}
            fill={`url(#azSky${size})`}/>
      <rect x="0" y={H*0.22} width={W} height={H*0.12} fill={`url(#azSky${size})`}/>

      {/* Sunset strip below sky */}
      <rect x="0" y={H*0.32} width={W} height={H*0.1}
            fill={`url(#azSun${size})`} opacity="0.85"/>

      {/* ARIZONA state text in sky */}
      <text x={W/2} y={H*0.19} textAnchor="middle" dominantBaseline="middle"
            fill="#ffffff" fontSize={s.font} fontWeight="800"
            fontFamily="Arial,sans-serif" letterSpacing="2.5">
        ARIZONA
      </text>

      {/* Plate number — bold dark blue */}
      <text x={W/2} y={H*0.65} textAnchor="middle" dominantBaseline="middle"
            fill="#1e3a8a" fontSize={s.bold} fontWeight="900"
            fontFamily="'DM Mono',monospace" letterSpacing="3">
        {plate.toUpperCase()}
      </text>

      {/* Grand Canyon State */}
      <text x={W/2} y={H*0.9} textAnchor="middle" dominantBaseline="middle"
            fill="#64748b" fontSize={Math.max(s.font-2, 7)} fontWeight="500"
            fontFamily="Arial,sans-serif" letterSpacing="0.5">
        Grand Canyon State
      </text>

      {/* Bolt holes */}
      <circle cx={s.bolts+1} cy={H/2} r={s.boltR} fill="#94a3b8"/>
      <circle cx={W-s.bolts-1} cy={H/2} r={s.boltR} fill="#94a3b8"/>
    </svg>
  );
}

// ── Vehicle Group (collapses multi-trip vehicles) ────────────────────────────
function VehicleGroup({ trips, now, vehicles, drivers, stopsByRoute, appUrl, makeHandlers, allShiftRoutes, allRoutes, onAssignFirst, onMoveRoute, onSavePhone }) {
  const [open, setOpen]               = useState(false);
  const [editingPhone, setEditingPhone] = useState(false);
  const [phoneInput, setPhoneInput]   = useState("");
  const [showAddRoute, setShowAddRoute] = useState(false);
  const [movingSaving, setMovingSaving] = useState(false);
  const [showAllShifts, setShowAllShifts] = useState(false);

  const base       = getVehicleBase(trips[0].vehicle);
  const plate      = vehicles?.[base] || "";
  const driver     = trips[0].driver_name || "";
  const driverObj  = driver ? (drivers || []).find(d =>
    `${d.firstName} ${d.lastName}`.trim().toLowerCase() === driver.trim().toLowerCase()
  ) : null;
  const phone      = driverObj?.phone || "";
  const totalMins  = trips.reduce((s, r) => s + (r.est_minutes || 0), 0);
  const totalBags  = trips.reduce((s, r) => s + (r.total_bags  || 0), 0);
  const totalStops = trips.reduce((s, r) => s + (r.total_stops || 0), 0);
  const allDone    = trips.every(r => r.status === "complete");
  const anyActive  = trips.some(r => r.status === "in_progress" || r.status === "assigned");
  const liveAllStops = trips.flatMap(r => stopsByRoute[r.id] || []);
  const liveDone   = liveAllStops.filter(s => s.status === "delivered" || s.status === "skipped").length;
  const liveTotal  = liveAllStops.length || totalStops;
  const pct        = liveTotal > 0 ? Math.round(liveDone / liveTotal * 100) : 0;

  const isVan    = /van/i.test(base);
  const icon     = isVan ? "🚐" : "🚛";
  const color    = allDone ? "#16a34a" : anyActive ? "#d97706" : "#6b7280";
  const bgHeader = allDone ? "#f0fdf4" : "#fff";

  // Vehicle status badge — based on current trip activity
  const sortedTrips = [...trips].sort((a,b) => {
    const m = v => { const x = v.match(/[Tt]rip\s*(\d+)/); return x ? parseInt(x[1]) : 0; };
    return m(a.vehicle) - m(b.vehicle);
  });
  const activeTripIdx = sortedTrips.findIndex(r => r.status === "in_progress");
  const activeTrip    = activeTripIdx >= 0 ? sortedTrips[activeTripIdx] : null;
  const lastComplete  = !activeTrip && sortedTrips.some(r => r.status === "complete") &&
                        !sortedTrips.every(r => r.status === "complete");
  const nextTrip      = lastComplete ? sortedTrips.find(r => r.status !== "complete") : null;

  let vehicleStatusBadge = null;
  if (activeTrip) {
    const activeStops = stopsByRoute[activeTrip.id] || [];
    const doneStops   = activeStops.filter(s => s.status === "delivered" || s.status === "skipped");
    if (doneStops.length > 0 && doneStops.length < activeStops.length) {
      vehicleStatusBadge = { icon:"🚛", label:"Delivering", bg:"#fef3c7", color:"#92400e", border:"#fcd34d" };
    } else if (doneStops.length === activeStops.length && activeStops.length > 0) {
      vehicleStatusBadge = { icon:"↩", label:"Returning", bg:"#ede9fe", color:"#4c1d95", border:"#c4b5fd" };
    }
  } else if (lastComplete && nextTrip?.is_loaded) {
    vehicleStatusBadge = { icon:"✓", label:"Loaded", bg:"#dcfce7", color:"#166534", border:"#86efac" };
  } else if (!activeTrip && sortedTrips[0]?.is_loaded && sortedTrips[0]?.status !== "complete") {
    vehicleStatusBadge = { icon:"✓", label:"Loaded", bg:"#dcfce7", color:"#166534", border:"#86efac" };
  }

  // Current bags in truck
  const _tLoaded   = trips.filter(r => r.is_loaded).reduce((s,r) => s + (r.bags_loaded || 0), 0);
  const _tConsumed = trips.reduce((s, r) => {
    const stops = (stopsByRoute || {})[r.id] || [];
    const deliveredBags = stops
      .filter(st => st.status === "delivered" || st.status === "skipped")
      .reduce((a, st) => a + (st.bags || 0), 0);
    if (stops.length > 0 && deliveredBags > 0) return s + deliveredBags;
    if (r.status === "complete") return s + (r.total_bags || 0);
    return s;
  }, 0);
  const currentBagsInTruck = Math.max(0, _tLoaded - _tConsumed);

  const fmtMins = (m) => {
    if (!m) return "—";
    const h = Math.floor(m / 60), mm = Math.round(m % 60);
    return h > 0 ? `~${h}h ${mm}m` : `~${mm}m`;
  };

  return (
    <div style={{ border:"1px solid #e5e7eb", borderRadius:12, overflow:"hidden",
                  boxShadow:"0 1px 3px rgba(0,0,0,.06)", opacity: allDone ? .75 : 1 }}>
      {/* Vehicle header — always visible */}
      <div style={{ background: bgHeader, padding:"12px 14px", cursor:"pointer" }}
           onClick={() => setOpen(o => !o)}>
        {/* Grid: left col (rows 0-2) | center bags box (rows 0-2) | right col (rows 0-2) */}
        <div style={{ display:"grid",
                      gridTemplateColumns:"1fr auto 1fr",
                      gridTemplateRows:"auto auto auto",
                      gap:"4px 10px",
                      marginBottom:4,
                      alignItems:"stretch" }}>

          {/* [0,0] Left row 0: icon + truck name */}
          <div style={{ gridColumn:1, gridRow:1,
                        display:"flex", alignItems:"center", gap:6 }}>
            <span style={{ fontSize:20 }}>{icon}</span>
            <span style={{ fontSize:11, color:"#9ca3af", fontFamily:"'DM Mono',monospace",
                            fontWeight:600, letterSpacing:.5 }}>
              {base}
            </span>
          </div>

          {/* [0,2] Right row 0: +Route */}
          <div style={{ gridColumn:3, gridRow:1,
                        display:"flex", justifyContent:"flex-end", alignItems:"center" }}>
            <button onClick={e => { e.stopPropagation(); setShowAddRoute(true); }}
              style={{ height:24, padding:"0 10px", background:"#1a3a2a", color:"#fff",
                       border:"none", borderRadius:6, fontSize:11, fontWeight:700,
                       cursor:"pointer", whiteSpace:"nowrap" }}>
              + Route
            </button>
          </div>

          {/* [1,0] Left row 1: plate */}
          <div style={{ gridColumn:1, gridRow:2,
                        display:"flex", alignItems:"center" }}>
            {plate && <LicensePlate plate={plate} size="sm" />}
          </div>

          {/* [0-2, center] Bags box spans all 3 rows */}
          {currentBagsInTruck > 0 ? (
            <div style={{ gridColumn:2, gridRow:"1 / 5",
                          background:"#f0fdf4", border:"2px solid #16a34a", borderRadius:10,
                          padding:"8px 16px", textAlign:"center", display:"flex",
                          flexDirection:"column", justifyContent:"center",
                          alignItems:"center", flexShrink:0 }}>
              {vehicleStatusBadge && (
                <div style={{ fontSize:9, fontWeight:700, color:vehicleStatusBadge.color,
                               textTransform:"uppercase", letterSpacing:.5, marginBottom:2 }}>
                  {vehicleStatusBadge.icon} {vehicleStatusBadge.label}
                </div>
              )}
              <div style={{ fontSize:30, fontWeight:800, color:"#15803d",
                             fontFamily:"'DM Mono',monospace", lineHeight:1 }}>
                {currentBagsInTruck}
              </div>
              <div style={{ fontSize:10, color:"#15803d", marginTop:2 }}>bags</div>
            </div>
          ) : (
            <div style={{ gridColumn:2, gridRow:"1 / 5" }} />
          )}

          {/* [1,2] Right row 1: status badge (no bags) */}
          <div style={{ gridColumn:3, gridRow:2,
                        display:"flex", justifyContent:"flex-end", alignItems:"center" }}>
            {vehicleStatusBadge && currentBagsInTruck === 0 && (
              <span style={{ fontSize:10, fontWeight:700, padding:"2px 7px", borderRadius:8,
                              background:vehicleStatusBadge.bg, color:vehicleStatusBadge.color,
                              border:`1px solid ${vehicleStatusBadge.border}`, whiteSpace:"nowrap" }}>
                {vehicleStatusBadge.icon} {vehicleStatusBadge.label}
              </span>
            )}
          </div>

          {/* Row 3 left: driver name */}
          <div style={{ gridColumn:1, gridRow:3, display:"flex", alignItems:"center" }}>
            {driver ? (
              <span style={{ fontSize:12, fontWeight:600, color:"#374151" }}>👤 {driver}</span>
            ) : (
              <button onClick={e => { e.stopPropagation(); onAssignFirst(); }}
                style={{ fontSize:11, color:"#dc2626", background:"none", border:"none",
                         padding:0, cursor:"pointer", textDecoration:"underline", fontWeight:600 }}>
                👤 Assign driver
              </button>
            )}
          </div>

          {/* Row 4 left: phone */}
          <div style={{ gridColumn:1, gridRow:4, display:"flex", alignItems:"center" }}>
            {driver && (phone
              ? <PhoneLink phone={phone} style={{ fontSize:11 }} />
              : <button onClick={e => { e.stopPropagation(); setEditingPhone(true); }}
                  style={{ fontSize:11, color:"#dc2626", background:"none", border:"none",
                           padding:0, cursor:"pointer", textDecoration:"underline", fontWeight:600 }}>
                  Add phone
                </button>
            )}
          </div>

          {/* Row 4 right: Show Trips */}
          <div style={{ gridColumn:3, gridRow:4,
                        display:"flex", justifyContent:"flex-end", alignItems:"center" }}>
            <button onClick={e => { e.stopPropagation(); setOpen(o => !o); }}
              style={{ fontSize:11, fontWeight:600, color:"#6b7280", background:"#f3f4f6",
                       border:"1px solid #e5e7eb", borderRadius:6, padding:"3px 10px",
                       cursor:"pointer", whiteSpace:"nowrap" }}>
              {open ? "Hide Trips" : "Show Trips"}
            </button>
          </div>
        </div>
        {editingPhone && driver && (
          <div onClick={e => e.stopPropagation()}
               style={{ display:"flex", gap:6, marginBottom:6, alignItems:"center" }}>
            <input value={phoneInput} onChange={e => setPhoneInput(e.target.value)}
              placeholder="(xxx) xxx-xxxx" autoFocus
              onKeyDown={e => {
                if (e.key === "Enter") { onSavePhone(phoneInput); setEditingPhone(false); }
                if (e.key === "Escape") setEditingPhone(false);
              }}
              style={{ flex:1, height:30, padding:"0 8px", border:"1px solid #e5e7eb",
                       borderRadius:6, fontSize:12, outline:"none" }} />
            <button onClick={() => setEditingPhone(false)}
              style={{ width:26, height:26, border:"1px solid #e5e7eb", borderRadius:6,
                       background:"#f9fafb", fontSize:12, cursor:"pointer" }}>✕</button>
            <button onClick={() => { onSavePhone(phoneInput); setEditingPhone(false); }}
              style={{ width:26, height:26, border:"none", borderRadius:6,
                       background:"#1a3a2a", color:"#fff", fontSize:12, cursor:"pointer" }}>✓</button>
          </div>
        )}

        {/* Progress bar */}
        <div style={{ height:4, background:"#e5e7eb", borderRadius:2, overflow:"hidden", marginBottom:3 }}>
          <div style={{ height:"100%", borderRadius:2, transition:"width .4s",
                        background: pct === 100 ? "#16a34a" : pct > 0 ? "#f59e0b" : "#d1d5db",
                        width:`${pct}%` }} />
        </div>

        {/* Row 3: progress · trips · bags · stops · time all on one line */}
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:4 }}>
          <span style={{ fontSize:10, color, fontWeight:600 }}>
            {liveDone}/{liveTotal} stops · {pct}%{allDone ? " ✓ Complete" : ""}
          </span>
          <span style={{ fontSize:10, color:"#6b7280", fontFamily:"'DM Mono',monospace" }}>
            {trips.length > 1 ? `${trips.length} trips · ` : ""}{totalBags} bags · {totalStops} stops
            <span style={{ color:"#2563eb", fontWeight:600, marginLeft:4 }}>{fmtMins(totalMins)}</span>
          </span>
        </div>


      </div>

      {/* Add Route modal */}
      {showAddRoute && (() => {
        const thisBase    = base;
        const nextTripNum = trips.length + 1;
        const newVehicleName = () => `${thisBase} Trip ${nextTripNum}`;
        const sourcePool  = showAllShifts ? (allRoutes || []) : (allShiftRoutes || []);
        const eligible    = sourcePool.filter(r =>
          getVehicleBase(r.vehicle) !== thisBase &&
          r.status !== "complete" &&
          (stopsByRoute[r.id] || []).filter(s => s.status === "delivered" || s.status === "skipped").length === 0
        );
        // Group by shift then vehicle base
        const shiftGroups = {};
        for (const r of eligible) {
          const shiftKey = r.shift || `Shift ${r.shift_num}`;
          if (!shiftGroups[shiftKey]) shiftGroups[shiftKey] = {};
          const b = getVehicleBase(r.vehicle);
          if (!shiftGroups[shiftKey][b]) shiftGroups[shiftKey][b] = [];
          shiftGroups[shiftKey][b].push(r);
        }
        return (
          <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.55)", zIndex:250,
                        display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}
               onClick={() => { setShowAddRoute(false); setShowAllShifts(false); }}>
            <div onClick={e => e.stopPropagation()}
                 style={{ background:"#fff", borderRadius:14, width:420, maxWidth:"100%",
                          maxHeight:"88vh", display:"flex", flexDirection:"column",
                          boxShadow:"0 20px 60px rgba(0,0,0,.3)", overflow:"hidden" }}>
              {/* Header */}
              <div style={{ padding:"14px 18px", background:"#1a3a2a", flexShrink:0 }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                  <div>
                    <div style={{ color:"#fff", fontWeight:700, fontSize:14 }}>Add Route to {thisBase}</div>
                    <div style={{ color:"rgba(255,255,255,.6)", fontSize:11, marginTop:2 }}>
                      Becomes Trip {nextTripNum} · {eligible.length} eligible route{eligible.length!==1?"s":""}
                    </div>
                  </div>
                  <button onClick={() => setShowAllShifts(v => !v)}
                    style={{ padding:"5px 10px", borderRadius:7, border:"none", fontSize:11,
                             fontWeight:700, cursor:"pointer",
                             background: showAllShifts ? "#4ade80" : "rgba(255,255,255,.15)",
                             color: showAllShifts ? "#1a3a2a" : "#fff" }}>
                    {showAllShifts ? "All Shifts ✓" : "All Shifts"}
                  </button>
                </div>
              </div>
              {/* Route list */}
              <div style={{ overflowY:"auto", flex:1 }}>
                {eligible.length === 0 ? (
                  <div style={{ padding:32, textAlign:"center", color:"#9ca3af", fontSize:13 }}>
                    {showAllShifts ? "No eligible routes across any shift" : "No eligible routes in this shift — try All Shifts"}
                  </div>
                ) : (
                  Object.entries(shiftGroups).map(([shiftLabel, vehicleMap]) => (
                    <div key={shiftLabel}>
                      {/* Shift section header (only shown when viewing all shifts) */}
                      {showAllShifts && (
                        <div style={{ padding:"8px 16px 4px", fontSize:11, fontWeight:700,
                                       color:"#fff", background:"#374151",
                                       borderBottom:"1px solid #4b5563", letterSpacing:.3 }}>
                          {shiftLabel}
                        </div>
                      )}
                      {Object.entries(vehicleMap).map(([groupBase, groupRoutes]) => (
                        <div key={groupBase}>
                          <div style={{ padding:"6px 16px 3px", fontSize:10, fontWeight:700,
                                         color:"#9ca3af", textTransform:"uppercase", letterSpacing:.5,
                                         background:"#f9fafb", borderBottom:"1px solid #f3f4f6" }}>
                            {groupBase}
                          </div>
                          {groupRoutes.map(r => (
                            <div key={r.id} style={{ padding:"10px 16px", borderBottom:"1px solid #f3f4f6",
                                                      display:"flex", alignItems:"center", gap:10 }}>
                              <div style={{ flex:1, minWidth:0 }}>
                                <div style={{ fontFamily:"'DM Mono',monospace", fontWeight:700,
                                               fontSize:12, color:"#111827" }}>{r.vehicle}</div>
                                <div style={{ fontSize:11, color:"#6b7280", marginTop:2 }}>
                                  {r.total_stops} stops · {r.total_bags} bags
                                  {r.est_minutes ? ` · ~${Math.round(r.est_minutes/60*10)/10}h` : ""}
                                  {r.driver_name ? ` · 👤 ${r.driver_name}` : ""}
                                </div>
                                {r.status === "in_progress" && (
                                  <div style={{ fontSize:10, color:"#d97706", marginTop:1, fontWeight:600 }}>
                                    🚛 In progress
                                  </div>
                                )}
                              </div>
                              <button disabled={movingSaving}
                                onClick={async () => {
                                  setMovingSaving(true);
                                  await onMoveRoute(r.id, newVehicleName());
                                  setMovingSaving(false);
                                  setShowAddRoute(false);
                                  setShowAllShifts(false);
                                }}
                                style={{ height:32, padding:"0 12px", background:"#1a3a2a",
                                         color:"#fff", border:"none", borderRadius:7,
                                         fontSize:12, fontWeight:600, cursor:"pointer",
                                         whiteSpace:"nowrap", flexShrink:0 }}>
                                {movingSaving ? "…" : "Add"}
                              </button>
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  ))
                )}
              </div>
              {/* Footer */}
              <div style={{ padding:"10px 18px", borderTop:"1px solid #e5e7eb", flexShrink:0 }}>
                <button onClick={() => { setShowAddRoute(false); setShowAllShifts(false); }}
                  style={{ width:"100%", height:38, background:"#f3f4f6", color:"#374151",
                           border:"1px solid #d1d5db", borderRadius:8, fontSize:13, fontWeight:600,
                           cursor:"pointer" }}>Cancel</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Expanded trips */}
      {open && (
        <div style={{ borderTop:"2px solid #b8bfc8", background:"#d0d6de" }}>
          {trips.map(r => (
            <div key={r.id}
                 style={{ opacity: r.status === "complete" ? .6 : 1,
                          borderBottom:"1px solid #b8bfc8",
                          background:"#d0d6de" }}>
              <RouteCard route={r} now={now} vehicles={vehicles} drivers={drivers}
                appUrl={appUrl(r.id)} {...makeHandlers(r)} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Route Card ────────────────────────────────────────────────────────────────
function DriverPhoneRow({ driverName, phone, onSave }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft]     = useState(phone);
  const [saving, setSaving]   = useState(false);

  const handleSave = async () => {
    if (!draft.trim()) return;
    setSaving(true);
    await onSave(draft.trim());
    setSaving(false);
    setEditing(false);
  };

  return (
    <div style={{ marginTop:3 }}>
      <div style={{ fontSize:12, color:"#374151", fontWeight:600 }}>👤 {driverName}</div>
      {editing ? (
        <div style={{ display:"flex", gap:6, marginTop:4, alignItems:"center" }}>
          <input value={draft} onChange={e => setDraft(e.target.value)}
            placeholder="(xxx) xxx-xxxx" autoFocus
            onKeyDown={e => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") setEditing(false); }}
            style={{ flex:1, height:32, padding:"0 8px", border:"1px solid #e5e7eb",
                     borderRadius:6, fontSize:12, outline:"none" }} />
          <button onClick={() => setEditing(false)}
            style={{ width:28, height:28, border:"1px solid #e5e7eb", borderRadius:6,
                     background:"#f9fafb", fontSize:12, cursor:"pointer" }}>✕</button>
          <button onClick={handleSave} disabled={saving}
            style={{ width:28, height:28, border:"none", borderRadius:6,
                     background:"#1a3a2a", color:"#fff", fontSize:12, cursor:"pointer" }}>
            {saving ? "…" : "✓"}
          </button>
        </div>
      ) : phone ? (
        <div style={{ fontSize:11, color:"#6b7280", marginTop:1 }}>📞 {phone}</div>
      ) : (
        <button onClick={() => { setDraft(""); setEditing(true); }}
          style={{ fontSize:11, color:"#dc2626", background:"none", border:"none",
                   padding:0, cursor:"pointer", marginTop:1, textDecoration:"underline" }}>
          Update phone number
        </button>
      )}
    </div>
  );
}

function RouteCard({ route, liveStops, now, vehicles, drivers, onAssign, onQr, onPrint, onMarkComplete, onResetRoute, onUpdateDriverPhone, appUrl }) {
  const isLoaded = route.is_loaded;
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
    <div style={{ background:"#d0d6de", border:"none", borderRadius:0,
                  overflow:"hidden" }}>
      <div style={{ padding:"12px 14px" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:8 }}>
          <div>
            {(() => {
              const vBase = route.vehicle.replace(/\s*[Tt]rip\s*\d+/g,"").replace(/\s*\(prev:.*?\)/gi,"").trim();
              const vData = vehicles?.[vBase];
              const plate = vData?.plate ?? vData ?? "";
              return plate ? (
                <div style={{ marginBottom:4 }}>
                  <LicensePlate plate={plate} size="sm" />
                </div>
              ) : null;
            })()}
              <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                <div style={{ fontFamily:"'DM Mono',monospace", fontWeight:700, fontSize:13, color:"#111827" }}>
                  {route.vehicle.replace(/\s*\(prev:.*?\)/i, "")}
                  {route.vehicle.match(/\(prev:.*?\)/i) && (
                    <span style={{ fontWeight:400, fontSize:11, color:"#9ca3af", marginLeft:4 }}>
                      {route.vehicle.match(/\(prev:.*?\)/i)[0]}
                    </span>
                  )}
                </div>
                {isLoaded && (
                  <span style={{ background:"#dcfce7", color:"#15803d", fontSize:10,
                                  fontWeight:700, padding:"1px 7px", borderRadius:8 }}>
                    ✓ Loaded
                  </span>
                )}
              </div>
            {route.driver_name && (() => {
              const d = (drivers || []).find(d =>
                `${d.firstName} ${d.lastName}`.trim().toLowerCase() === (route.driver_name || "").trim().toLowerCase()
              );
              return (
                <DriverPhoneRow
                  driverName={route.driver_name}
                  phone={d?.phone || ""}
                  onSave={(phone) => onUpdateDriverPhone(route.driver_name, phone)}
                />
              );
            })()}
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
          {route.est_minutes && (() => {
            const h = Math.floor(route.est_minutes / 60);
            const m = Math.round(route.est_minutes % 60);
            const label = h > 0 ? `~${h}h ${m}m` : `~${m}m`;
            return (
              <div style={{ background:"rgba(255,255,255,.08)", borderRadius:6, padding:"3px 4px",
                             fontFamily:"'DM Mono',monospace", fontSize:12, color:"#2563eb" }}>
                <strong>{label}</strong>
              </div>
            );
          })()}
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
          {(() => {
            if (!route.driver_name) return null;
            const d = (drivers || []).find(d =>
              `${d.firstName} ${d.lastName}`.trim().toLowerCase() === route.driver_name.trim().toLowerCase()
            );
            if (!d?.phone) return null;
            const digits  = d.phone.replace(/\D/g, "");
            const smsBody = `Hi ${d.firstName}, here is your mulch delivery route: ${appUrl}`;
            return (
              <a href={`sms:${digits}?body=${encodeURIComponent(smsBody)}`}
                 style={{ height:32, width:32, background:"#22c55e", border:"none", borderRadius:6,
                          cursor:"pointer", color:"#fff", textDecoration:"none",
                          display:"flex", alignItems:"center", justifyContent:"center", fontSize:15 }}
                 title={`Text route link to ${route.driver_name}`}>
                💬
              </a>
            );
          })()}
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
