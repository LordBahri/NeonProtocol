// Holographic UI theme — inject once at startup, used by all UI components.

export const NEON_CYAN   = '#00eeff';
export const NEON_BLUE   = '#0088ff';
export const NEON_GREEN  = '#00ff88';
export const NEON_RED    = '#ff2244';
export const NEON_AMBER  = '#ffaa00';
export const NEON_PURPLE = '#aa44ff';

const THEME_CSS = `
@keyframes holo-flicker {
  0%,100% { opacity:1; filter:brightness(1); }
  87%  { opacity:1; }
  88%  { opacity:0.70; filter:brightness(0.75); }
  89%  { opacity:1;    filter:brightness(1.08); }
  94%  { opacity:0.88; filter:brightness(0.92); }
  95%  { opacity:1; }
}
@keyframes scan-line {
  from { transform:translateY(-100%); }
  to   { transform:translateY(200%);  }
}
@keyframes glow-pulse {
  0%,100% { opacity:0.7; }
  50%     { opacity:1;   }
}
@keyframes slide-in-left {
  from { transform:translateX(-20px); opacity:0; }
  to   { transform:translateX(0);     opacity:1; }
}
@keyframes slide-in-right {
  from { transform:translateX(20px);  opacity:0; }
  to   { transform:translateX(0);     opacity:1; }
}
@keyframes float-up {
  0%   { transform:translateY(0);     opacity:1; }
  100% { transform:translateY(-44px); opacity:0; }
}
@keyframes static-burst {
  0%,100% { opacity:0;    }
  50%     { opacity:0.05; }
}
@keyframes holo-spin { to { transform:rotate(360deg); } }
@keyframes blink {
  0%,100% { opacity:1; }
  50%     { opacity:0.3; }
}

/* ── Base panel ─────────────────────────────────────────────────────── */
.holo-panel {
  position:absolute;
  background:rgba(0,7,16,0.90);
  border:1px solid rgba(0,180,220,0.28);
  box-shadow:0 0 18px rgba(0,200,255,0.09), inset 0 0 30px rgba(0,8,20,0.5);
  animation:holo-flicker 14s infinite;
  font-family:'Courier New',monospace;
  color:#00eeff;
  font-size:11px;
  overflow:hidden;
}
.holo-panel::after {
  content:'';
  position:absolute;left:0;right:0;
  height:2px;
  background:linear-gradient(90deg,transparent,rgba(0,220,255,0.18),transparent);
  animation:scan-line 3.5s linear infinite;
  pointer-events:none;
  z-index:50;
}

/* ── Draggable window ───────────────────────────────────────────────── */
.holo-window {
  position:fixed;
  display:flex;
  flex-direction:column;
  background:rgba(0,5,14,0.94);
  border:1px solid rgba(0,180,220,0.30);
  box-shadow:0 0 24px rgba(0,170,255,0.12), 0 4px 44px rgba(0,0,0,0.72), inset 0 0 40px rgba(0,6,18,0.55);
  font-family:'Courier New',monospace;
  color:#00eeff;
  font-size:11px;
  overflow:hidden;
  min-width:240px;
  animation:holo-flicker 18s infinite;
  transition:opacity 0.18s ease, transform 0.18s ease;
}
.holo-window::after {
  content:'';
  position:absolute;left:0;right:0;
  height:2px;
  background:linear-gradient(90deg,transparent,rgba(0,220,255,0.10),transparent);
  animation:scan-line 4.5s linear infinite;
  pointer-events:none;
  z-index:100;
}
.holo-window.hidden { opacity:0; pointer-events:none; transform:scale(0.96) translateY(8px); }

/* ── Title bar ──────────────────────────────────────────────────────── */
.holo-titlebar {
  display:flex;
  align-items:center;
  justify-content:space-between;
  padding:7px 10px 6px;
  background:rgba(0,18,34,0.92);
  border-bottom:1px solid rgba(0,180,220,0.20);
  cursor:move;
  user-select:none;
  flex-shrink:0;
  min-height:32px;
}
.holo-titlebar-label {
  font-size:9px;
  letter-spacing:3px;
  color:rgba(0,210,255,0.65);
  text-shadow:0 0 8px rgba(0,210,255,0.45);
  text-transform:uppercase;
}
.holo-btn-row { display:flex; gap:5px; }
.holo-wbtn {
  width:16px; height:16px;
  border:1px solid rgba(0,180,220,0.35);
  background:rgba(0,18,32,0.8);
  cursor:pointer;
  display:flex; align-items:center; justify-content:center;
  font-size:9px;
  color:rgba(0,180,220,0.45);
  transition:all 0.12s;
  clip-path:polygon(0 0,100% 0,100% 65%,65% 100%,0 100%);
  line-height:1;
}
.holo-wbtn:hover { background:rgba(0,55,80,0.9); color:#00eeff; border-color:rgba(0,220,255,0.6); }
.holo-wbtn.close:hover { background:rgba(70,8,0,0.9); color:#ff2244; border-color:rgba(255,25,40,0.55); }

/* ── Corner decorations ─────────────────────────────────────────────── */
.holo-corner-tl,.holo-corner-tr,.holo-corner-bl,.holo-corner-br {
  position:absolute; width:11px; height:11px; pointer-events:none; z-index:10;
}
.holo-corner-tl { top:0;    left:0;   border-top:1px solid rgba(0,200,255,0.6); border-left:1px solid rgba(0,200,255,0.6); }
.holo-corner-tr { top:0;    right:0;  border-top:1px solid rgba(0,200,255,0.6); border-right:1px solid rgba(0,200,255,0.6); }
.holo-corner-bl { bottom:0; left:0;   border-bottom:1px solid rgba(0,200,255,0.6); border-left:1px solid rgba(0,200,255,0.6); }
.holo-corner-br { bottom:0; right:0;  border-bottom:1px solid rgba(0,200,255,0.6); border-right:1px solid rgba(0,200,255,0.6); }

/* ── Content ────────────────────────────────────────────────────────── */
.holo-content { flex:1; overflow:hidden; position:relative; }
.holo-scrollable {
  overflow-y:auto; height:100%;
  scrollbar-width:thin;
  scrollbar-color:rgba(0,170,220,0.28) transparent;
}
.holo-scrollable::-webkit-scrollbar { width:4px; }
.holo-scrollable::-webkit-scrollbar-track { background:transparent; }
.holo-scrollable::-webkit-scrollbar-thumb { background:rgba(0,170,220,0.28); border-radius:2px; }

/* ── Tabs ───────────────────────────────────────────────────────────── */
.holo-tabs {
  display:flex;
  border-bottom:1px solid rgba(0,180,220,0.18);
  background:rgba(0,9,20,0.85);
  flex-shrink:0;
}
.holo-tab {
  padding:7px 14px;
  font-size:9px;
  letter-spacing:2px;
  color:rgba(0,170,210,0.38);
  cursor:pointer;
  text-transform:uppercase;
  border-right:1px solid rgba(0,180,220,0.10);
  transition:all 0.12s;
  user-select:none;
}
.holo-tab:hover  { color:rgba(0,210,255,0.75); background:rgba(0,28,46,0.5); }
.holo-tab.active {
  color:#00eeff;
  background:rgba(0,38,58,0.7);
  border-bottom:1px solid #00eeff;
  text-shadow:0 0 7px rgba(0,220,255,0.65);
  margin-bottom:-1px;
}

/* ── Bar ────────────────────────────────────────────────────────────── */
.holo-bar-track {
  height:5px;
  background:rgba(0,18,32,0.9);
  border:1px solid rgba(0,70,96,0.3);
  position:relative; overflow:hidden;
  border-radius:1px;
}
.holo-bar-fill {
  height:100%;
  transition:width 0.28s ease-out;
  position:relative;
  border-radius:1px;
}
.holo-bar-fill::after {
  content:'';
  position:absolute; right:0; top:0; bottom:0;
  width:3px;
  background:rgba(255,255,255,0.55);
  filter:blur(1px);
}

/* ── Buttons ────────────────────────────────────────────────────────── */
.holo-action-btn {
  padding:5px 14px;
  font-family:'Courier New',monospace;
  font-size:9px; letter-spacing:2px;
  text-transform:uppercase;
  background:rgba(0,18,38,0.85);
  border:1px solid rgba(0,175,220,0.32);
  color:rgba(0,210,255,0.65);
  cursor:pointer;
  clip-path:polygon(0 0,100% 0,100% calc(100% - 6px),calc(100% - 6px) 100%,0 100%);
  transition:all 0.12s;
  user-select:none;
}
.holo-action-btn:hover {
  background:rgba(0,48,76,0.92);
  color:#00eeff;
  border-color:rgba(0,215,255,0.55);
  box-shadow:0 0 10px rgba(0,195,255,0.22);
}
.holo-action-btn.danger  { border-color:rgba(255,36,58,0.38); color:rgba(255,70,96,0.65); }
.holo-action-btn.danger:hover { background:rgba(56,0,8,0.92); color:#ff3355; border-color:rgba(255,24,42,0.55); }
.holo-action-btn:disabled { opacity:0.35; cursor:default; pointer-events:none; }

/* ── Input ──────────────────────────────────────────────────────────── */
.holo-input {
  background:rgba(0,12,26,0.92);
  border:1px solid rgba(0,145,175,0.28);
  color:#00eeff; font-family:'Courier New',monospace; font-size:10px;
  padding:4px 8px; outline:none;
  transition:border-color 0.14s;
}
.holo-input:focus { border-color:rgba(0,215,255,0.65); box-shadow:0 0 7px rgba(0,195,255,0.14); }

/* ── Label / value ──────────────────────────────────────────────────── */
.holo-label { font-size:9px; letter-spacing:2px; color:rgba(0,145,175,0.65); text-transform:uppercase; }
.holo-value { color:#00eeff; font-size:11px; }

/* ── Divider ────────────────────────────────────────────────────────── */
.holo-divider {
  height:1px;
  background:linear-gradient(90deg,transparent,rgba(0,175,220,0.28),transparent);
  margin:8px 0;
}

/* ── Status dots ────────────────────────────────────────────────────── */
.holo-dot {
  display:inline-block; width:7px; height:7px;
  border-radius:50%; margin-right:5px; vertical-align:middle;
}
.holo-dot.online  { background:#00ff88; box-shadow:0 0 6px #00ff88; }
.holo-dot.offline { background:#223344; }
.holo-dot.warning { background:#ffaa00; box-shadow:0 0 6px #ffaa00; animation:blink 1s infinite; }

/* ── Floating notification ──────────────────────────────────────────── */
.holo-notification {
  position:absolute; right:0;
  font-size:10px; letter-spacing:1px;
  pointer-events:none;
  animation:float-up 2.4s ease-out forwards;
  white-space:nowrap; font-family:'Courier New',monospace;
}

/* ── Static noise ───────────────────────────────────────────────────── */
.holo-static {
  position:absolute; inset:0;
  pointer-events:none;
  opacity:0.035;
  mix-blend-mode:screen;
  z-index:9;
  animation:static-burst 0.12s steps(1) infinite;
  background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.80' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
  background-size:180px 180px;
}

/* ── Slot ───────────────────────────────────────────────────────────── */
.holo-slot {
  width:48px; height:48px;
  border:1px solid rgba(0,160,200,0.25);
  background:rgba(0,12,24,0.8);
  display:flex; align-items:center; justify-content:center;
  font-size:8px; color:rgba(0,140,180,0.4);
  text-transform:uppercase; letter-spacing:1px;
  cursor:pointer; transition:all 0.12s;
  position:relative;
  clip-path:polygon(0 0,100% 0,100% 80%,80% 100%,0 100%);
}
.holo-slot:hover { border-color:rgba(0,220,255,0.5); background:rgba(0,30,50,0.8); color:#00eeff; }
.holo-slot.equipped { border-color:rgba(0,200,255,0.45); background:rgba(0,25,44,0.9); color:#00ccff; }
.holo-slot.high-slot { border-color:rgba(255,60,80,0.28); }
.holo-slot.high-slot.equipped { border-color:rgba(255,80,100,0.5); }
.holo-slot.mid-slot  { border-color:rgba(0,160,255,0.28); }
.holo-slot.low-slot  { border-color:rgba(255,160,0,0.28); }

/* ── Item row ───────────────────────────────────────────────────────── */
.holo-item-row {
  display:flex; align-items:center; gap:8px;
  padding:5px 10px;
  border-bottom:1px solid rgba(0,140,180,0.08);
  cursor:pointer; transition:background 0.10s;
  font-size:10px;
}
.holo-item-row:hover { background:rgba(0,30,50,0.6); }
.holo-item-row.selected { background:rgba(0,45,70,0.7); border-left:2px solid #00ccff; }
.holo-item-icon {
  width:28px; height:28px;
  border:1px solid rgba(0,150,200,0.22);
  display:flex; align-items:center; justify-content:center;
  font-size:14px; flex-shrink:0;
  background:rgba(0,15,30,0.8);
  clip-path:polygon(0 0,100% 0,100% 75%,75% 100%,0 100%);
}
`;

let _injected = false;
export function injectTheme(): void {
  if (_injected) return;
  _injected = true;
  const s = document.createElement('style');
  s.id    = 'holo-theme';
  s.textContent = THEME_CSS;
  document.head.appendChild(s);
}
