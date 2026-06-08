/* Hábitos — Matriz de hábitos (alta fidelidad, editable) */
const { useState, useEffect, useMemo, useRef } = React;

/* ---------------- marco temporal demo ---------------- */
const REF_Y = 2026, REF_M = 5 /*junio*/, REF_D = 23; // "hoy" de ejemplo
const DOW = ["L","M","X","J","V","S","D"];
const MES = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
const DOWLONG = ["lunes","martes","miércoles","jueves","viernes","sábado","domingo"];
function daysInMonth(y, m){ return new Date(y, m + 1, 0).getDate(); }
function firstDowOf(y, m){ return (new Date(y, m, 1).getDay() + 6) % 7; }
function dowOf(y, m, d){ return (new Date(y, m, d).getDay() + 6) % 7; }
function serial(y, m, d){ return (y * 12 + m) * 40 + d; }
const REF_SERIAL = serial(REF_Y, REF_M, REF_D);
function dateClass(y, m, d){ const s = serial(y, m, d); return s > REF_SERIAL ? "future" : (s === REF_SERIAL ? "today" : "past"); }
function dayKey(y, m, d){ return y + "." + m + "." + d; }
function capMonth(y, m){ const s = MES[m] + " " + y; return s[0].toUpperCase() + s.slice(1); }

/* ---------------- ids ---------------- */
let UID = 1000;
const uid = () => ++UID;
const mkObj = (name, created) => ({ id: uid(), name, created: created ?? null });

/* ---------------- metas iniciales ---------------- */
function initialGoals(){
  const g = [
    { name:"Vida más sana", objs:["Beber 6 vasos de agua","Estudiar inglés 20 min","Caminar 8.000 pasos","Leer 10 páginas","Dormir 8 horas"] },
    { name:"Aprender inglés", objs:["Vocabulario · 10 palabras","Escuchar un podcast","Gramática · 15 min","Hablar en voz alta"] },
    { name:"Proyecto personal", objs:["Escribir 30 min","Avanzar 1 tarea","Sin redes hasta mediodía"] },
  ];
  return g.map(go => {
    const objetivos = go.objs.map(nm => mkObj(nm, null));
    return { id: uid(), name: go.name, objetivos };
  });
}

/* ---------------- datos históricos deterministas ---------------- */
function seeded(n){ const x = Math.sin(n * 97.13) * 10000; return x - Math.floor(x); }
function bias(d){ return d >= 16 ? 1.0 : (d >= 11 ? 0.8 : 0.55); }
// histórico de ejemplo por defecto (se usa si no hay marca explícita guardada)
function seedDone(o, y, m, d){
  const r = seeded(o.id * 131 + (y * 12 + m) * 733 + d * 17);
  const b = (y === REF_Y && m === REF_M) ? bias(d) : 0.68; // mes actual: bloque reciente = racha; otros: ~68%
  return r < b;
}

/* ---------------- persistencia (localStorage) ---------------- */
const LSKEY = "habitos.v2";
function buildInitial(){
  const goals = initialGoals();
  const marks = {}; // marks[objId]["y.m.d"] = true/false (sobrescribe el histórico de ejemplo)
  const k = dayKey(REF_Y, REF_M, REF_D);
  goals.forEach(g => g.objetivos.forEach((o, i, arr) => {
    marks[o.id] = { [k]: i < Math.min(3, arr.length - 1) }; // hoy: 3 de 5 hechos al empezar
  }));
  return { goals, gi: 0, marks };
}
function loadState(){
  try {
    const raw = localStorage.getItem(LSKEY);
    if(!raw) return null;
    const s = JSON.parse(raw);
    if(!s || !Array.isArray(s.goals) || s.goals.length === 0) return null;
    let max = 1000;
    s.goals.forEach(g => { if(g.id > max) max = g.id; (g.objetivos || []).forEach(o => { if(o.id > max) max = o.id; }); });
    UID = Math.max(UID, max);
    return { goals: s.goals, gi: Math.min(s.gi || 0, s.goals.length - 1), marks: s.marks || {} };
  } catch(_) { return null; }
}
const INITIAL = loadState() || buildInitial();

/* ---------------- acentos ---------------- */
const ACCENTS = {
  evergreen: ["#1f7a52","#e4f0e9","#15543a"],
  indigo:    ["#3b5bdb","#e6e9fb","#2c3e9e"],
  clay:      ["#c0613f","#f3ddd2","#8f3e22"],
  plum:      ["#7a5cc4","#ece4f7","#553a96"],
};

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "accent": ["#1f7a52","#e4f0e9","#15543a"],
  "density": "Cómoda",
  "showFails": false,
  "weekSeparators": true,
  "showSummary": true
}/*EDITMODE-END*/;

/* =================================================================== */
function App(){
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [goals, setGoals] = useState(INITIAL.goals);
  const [gi, setGi] = useState(INITIAL.gi);
  const [marks, setMarks] = useState(INITIAL.marks);
  const [editObj, setEditObj] = useState(null);   // id en edición
  const [editVal, setEditVal] = useState("");
  const [renaming, setRenaming] = useState(false); // renombrar meta activa
  const [goalVal, setGoalVal] = useState("");
  const [dragId, setDragId] = useState(null);     // objetivo arrastrándose
  const [overId, setOverId] = useState(null);     // fila bajo el cursor
  const [viewY, setViewY] = useState(REF_Y);      // mes visible
  const [viewM, setViewM] = useState(REF_M);

  // guardar en el navegador en cada cambio
  useEffect(() => {
    try { localStorage.setItem(LSKEY, JSON.stringify({ goals, gi, marks })); } catch(_) {}
  }, [goals, gi, marks]);
  // mantener gi dentro de rango si se borran metas
  useEffect(() => { if(gi > goals.length - 1) setGi(Math.max(0, goals.length - 1)); }, [goals.length]);

  // estado de un objetivo en una fecha: true/false = hecho/no; null = no aplica (futuro o sin existir)
  function isDone(o, y, m, d){
    if(!o) return null;
    const dc = dateClass(y, m, d);
    if(dc === "future") return null;
    if(o.created != null && serial(y, m, d) < o.created) return null; // aún no existía
    const mo = marks[o.id];
    const k = dayKey(y, m, d);
    if(mo && mo[k] !== undefined) return mo[k];
    if(dc === "today") return false;     // hoy: sin marcar por defecto
    return seedDone(o, y, m, d);         // pasado: histórico de ejemplo
  }
  function cellState(o, y, m, d){
    const dc = dateClass(y, m, d);
    if(dc === "future") return "future";
    if(o.created != null && serial(y, m, d) < o.created) return "untracked";
    return isDone(o, y, m, d) ? "done" : "miss";
  }
  function dayComplete(list, y, m, d){
    if(dateClass(y, m, d) === "future") return "future";
    let tracked = 0, done = 0;
    for(const o of list){ const v = isDone(o, y, m, d); if(v === null) continue; tracked++; if(v) done++; }
    if(tracked === 0) return "none";
    if(done === tracked) return "done";
    if(done === 0) return "fail";
    return "partial";
  }

  useEffect(() => {
    const a = Array.isArray(t.accent) ? t.accent : ACCENTS.evergreen;
    const r = document.documentElement.style;
    r.setProperty("--accent", a[0]); r.setProperty("--accent-soft", a[1]); r.setProperty("--accent-ink", a[2]);
  }, [t.accent]);
  useEffect(() => { document.body.classList.toggle("compact", t.density === "Compacta"); }, [t.density]);

  const goal = goals[gi] || goals[0];
  const objetivos = goal.objetivos;
  const n = objetivos.length;
  const todayDone = objetivos.filter(o => isDone(o, REF_Y, REF_M, REF_D)).length;
  const monthDays = daysInMonth(viewY, viewM);
  const firstLead = firstDowOf(viewY, viewM);
  const days = Array.from({ length: monthDays }, (_, i) => i + 1);
  const weekSep = (d) => t.weekSeparators && dowOf(viewY, viewM, d) === 0 ? " week-sep" : "";
  const prevMonth = () => { let m = viewM - 1, y = viewY; if(m < 0){ m = 11; y--; } setViewM(m); setViewY(y); };
  const nextMonth = () => { let m = viewM + 1, y = viewY; if(m > 11){ m = 0; y++; } setViewM(m); setViewY(y); };

  /* ---- mutaciones ---- */
  const patchGoal = (fn) => setGoals(gs => gs.map((g, i) => i === gi ? fn(g) : g));
  function toggleCell(objId, y, m, d){
    if(dateClass(y, m, d) === "future") return;
    const o = objetivos.find(x => x.id === objId);
    if(o && o.created != null && serial(y, m, d) < o.created) return; // ese día no existía: no editable
    const cur = isDone(o, y, m, d) === true;
    const k = dayKey(y, m, d);
    setMarks(prev => ({ ...prev, [objId]: { ...(prev[objId] || {}), [k]: !cur } }));
  }
  const renameObj = (id, name) => patchGoal(g => ({ ...g, objetivos: g.objetivos.map(o => o.id === id ? { ...o, name } : o) }));
  const removeObj = (id) => patchGoal(g => ({ ...g, objetivos: g.objetivos.filter(o => o.id !== id) }));
  function moveObj(fromId, toId){
    if(fromId == null || toId == null || fromId === toId) return;
    patchGoal(g => {
      const arr = [...g.objetivos];
      const fi = arr.findIndex(o => o.id === fromId);
      const ti = arr.findIndex(o => o.id === toId);
      if(fi < 0 || ti < 0) return g;
      const [moved] = arr.splice(fi, 1);
      arr.splice(ti, 0, moved);
      return { ...g, objetivos: arr };
    });
  }
  function moveBy(id, delta){
    patchGoal(g => {
      const arr = [...g.objetivos];
      const i = arr.findIndex(o => o.id === id);
      const j = i + delta;
      if(i < 0 || j < 0 || j >= arr.length) return g;
      [arr[i], arr[j]] = [arr[j], arr[i]];
      return { ...g, objetivos: arr };
    });
  }
  function addObj(){
    const o = mkObj("", REF_SERIAL); // nuevo: sin historial previo a hoy
    patchGoal(g => ({ ...g, objetivos: [...g.objetivos, o] }));
    setEditObj(o.id); setEditVal("");
  }
  function startEdit(o){ setEditObj(o.id); setEditVal(o.name); }
  function commitEdit(raw){
    const id = editObj, name = (raw != null ? raw : editVal).trim();
    setEditObj(null);
    if(!id) return;
    if(name === "") removeObj(id); // cancelar objetivo vacío
    else renameObj(id, name);
  }
  function addGoal(){
    const ng = { id: uid(), name: "", objetivos: [] };
    setGoals(gs => [...gs, ng]);
    setGi(goals.length);
    setRenaming(true); setGoalVal("");
  }
  function startRenameGoal(){ setRenaming(true); setGoalVal(goal.name); }
  function commitGoal(raw){
    const name = (raw != null ? raw : goalVal).trim();
    setRenaming(false);
    if(name === ""){ if(goal.objetivos.length === 0){ setGoals(gs => gs.filter((_, i) => i !== gi)); setGi(0); } }
    else patchGoal(g => ({ ...g, name }));
  }
  function deleteGoal(){
    if(goals.length <= 1) return;
    setRenaming(false);
    setGoals(gs => gs.filter((_, i) => i !== gi));
    setGi(0);
  }

  /* ---- estadísticas ---- */
  const stats = useMemo(() => {
    // racha actual (viva), anclada en HOY (mes de referencia), independiente del mes que mires
    let streak = 0;
    {
      let from = dayComplete(objetivos, REF_Y, REF_M, REF_D) === "done" ? REF_D : REF_D - 1;
      for(let d = from; d >= 1; d--){ if(dayComplete(objetivos, REF_Y, REF_M, d) === "done") streak++; else break; }
    }
    // estadísticas del mes visible
    const status = {};
    let best = 0, run = 0, done = 0, slots = 0, perfect = 0, elapsed = 0;
    for(let d = 1; d <= monthDays; d++){
      const st = dayComplete(objetivos, viewY, viewM, d);
      status[d] = st;
      if(st === "future"){ run = 0; continue; }
      elapsed++;
      for(const o of objetivos){ const v = isDone(o, viewY, viewM, d); if(v === null) continue; slots++; if(v) done++; }
      if(st === "done"){ perfect++; run++; best = Math.max(best, run); } else run = 0;
    }
    const pct = slots ? Math.round(done / slots * 100) : 0;
    return { streak, best, pct, perfect, elapsed, status };
  }, [goals, gi, marks, viewY, viewM]);

  function objPct(o){
    let done = 0, total = 0;
    for(let d = 1; d <= monthDays; d++){ const v = isDone(o, viewY, viewM, d); if(v === null) continue; total++; if(v) done++; }
    return total ? Math.round(done / total * 100) : 0;
  }
  function objStreak(o){
    let last = 0;
    for(let d = monthDays; d >= 1; d--){ if(dateClass(viewY, viewM, d) !== "future"){ last = d; break; } }
    if(last === 0) return 0;
    let s = 0;
    for(let d = last; d >= 1; d--){ const st = cellState(o, viewY, viewM, d); if(st === "done") s++; else if(st === "untracked") continue; else break; }
    return s;
  }

  const ring = { boxShadow: "0 0 0 2px var(--card), 0 0 0 3.5px var(--accent)" };

  return (
    <div className="wrap">
      {/* -------- top bar -------- */}
      <div className="topbar">
        <div className="brand">
          <span className="mark"><span></span></span>
          <span className="name">hábitos<em> / matriz</em></span>
        </div>
        <div className="goal-seg">
          {goals.map((g, i) => (
            (renaming && i === gi) ? (
              <span key={g.id} className="ren-wrap">
                <input className="ren" autoFocus value={goalVal} placeholder="Nombre de la meta"
                  onChange={e => setGoalVal(e.target.value)} onBlur={e => commitGoal(e.target.value)}
                  onKeyDown={e => { if(e.key === "Enter") e.target.blur(); if(e.key === "Escape"){ e.target.value = g.name; e.target.blur(); } }} />
                {goals.length > 1 && (
                  <button className="ren-del" title="Eliminar esta meta" tabIndex={-1}
                    onMouseDown={e => { e.preventDefault(); if(window.confirm('¿Eliminar la meta "' + (g.name || "Sin nombre") + '" y todos sus objetivos?')) deleteGoal(); else setRenaming(false); }}>🗑 eliminar</button>
                )}
              </span>
            ) : (
              <button key={g.id} className={i === gi ? "on" : ""} title={i === gi ? "Doble clic para renombrar o eliminar" : ""}
                onClick={() => setGi(i)} onDoubleClick={() => { if(i === gi) startRenameGoal(); }}>{g.name || "Sin nombre"}</button>
            )
          ))}
          <button className="add" title="Nueva meta" onClick={addGoal}>+ meta</button>
        </div>
        <div className="spacer"></div>
        <div className="month-nav">
          <button className="nav-ic" onClick={prevMonth} title="Mes anterior">‹</button>
          <span className="mlabel">{capMonth(viewY, viewM)}</span>
          <button className="nav-ic" onClick={nextMonth} title="Mes siguiente">›</button>
        </div>
      </div>

      {/* -------- stat band -------- */}
      <div className="stat-band reveal">
        <div className="tile streak">
          <div className="cap">Racha actual</div>
          <div className="val"><span className="big">{stats.streak}</span><span className="unit" style={{ color: "rgba(255,255,255,.8)" }}>días perfectos</span></div>
          <div className="dots">{Array.from({ length: 14 }, (_, i) => <i key={i} className={i < stats.streak ? "f" : ""}></i>)}</div>
          <span className="spark">▰</span>
        </div>
        <div className="tile"><div className="cap">Mejor racha</div><div className="val"><span className="big">{stats.best}</span><span className="unit">días</span></div></div>
        <div className="tile"><div className="cap">Mes cumplido</div><div className="val"><span className="big">{stats.pct}</span><span className="unit">%</span></div><div className="progress-line"><i style={{ width: stats.pct + "%" }}></i></div></div>
        <div className="tile"><div className="cap">Días perfectos</div><div className="val"><span className="big">{stats.perfect}</span><span className="unit">/ {stats.elapsed}</span></div></div>
      </div>

      {/* -------- today check-in -------- */}
      <div className="today-card reveal">
        <div className="today-head">
          <span className="dot"></span>
          <h3>Hoy</h3>
          <span className="date">{DOWLONG[dowOf(REF_Y, REF_M, REF_D)]} · {REF_D} de {MES[REF_M]}</span>
          <span className="count">{todayDone} / {n}</span>
        </div>
        <div className="today-chips">
          {objetivos.map(o => {
            const done = isDone(o, REF_Y, REF_M, REF_D);
            return (
            <button key={o.id} className={"chip" + (done ? " on" : "")} onClick={() => toggleCell(o.id, REF_Y, REF_M, REF_D)}>
              <span className="tick">{done ? "✓" : ""}</span>{o.name || "Nuevo objetivo"}
            </button>
            );
          })}
          <button className="chip ghost" onClick={addObj}>+ objetivo</button>
        </div>
      </div>

      {/* -------- matrix -------- */}
      <div className="mx-card reveal">
        <div className="mx-top">
          <h3>Objetivos × días</h3>
          <span className="hint">cada cuadro = un objetivo en un día</span>
          <div className="legend">
            <span><i className="lg done"></i> cumplido</span>
            <span><i className="lg miss"></i> sin hacer</span>
            {t.showSummary && <span><i className="lg partial"></i> día parcial</span>}
            {t.showSummary && <span><i className="lg fail"></i> día fallado</span>}
          </div>
        </div>

        {n === 0 ? (
          <div className="empty-objs">Esta meta aún no tiene objetivos. <button className="add-obj" onClick={addObj} style={{ display: "inline-flex" }}>+ añadir el primero</button></div>
        ) : (
        <div className="mx-scroll">
          <table className="mx">
            <thead>
              <tr>
                <th className="lbl"></th>
                {days.map(d => (
                  <th key={d} className={"colhead" + (dateClass(viewY, viewM, d) === "today" ? " today" : "") + weekSep(d)}>
                    <div className="dow">{DOW[dowOf(viewY, viewM, d)]}</div>
                    <div className="dnum">{d}</div>
                  </th>
                ))}
                <th className="pct-head">cumpl.</th>
              </tr>
            </thead>
            <tbody>
              {t.showSummary && (
                <tr className="sumrow">
                  <td className="lbl"><span className="obj-name">Día completo</span></td>
                  {days.map(d => {
                    let st = stats.status[d];
                    if(st === "none") st = "future";
                    return <td key={d} className={weekSep(d).trim()}>
                      <div className={"sum-cell " + st} style={dateClass(viewY, viewM, d) === "today" ? ring : undefined} title={d + " " + MES[viewM]}></div>
                    </td>;
                  })}
                  <td className="pct"><span className="v">{stats.pct}%</span></td>
                </tr>
              )}
              {t.showSummary && <tr className="divider-row"><td colSpan={monthDays + 2}><div className="ln"></div></td></tr>}

              {objetivos.map((o, oi) => (
                <tr key={o.id}
                  className={(dragId === o.id ? "row-dragging" : "") + (overId === o.id && dragId !== o.id ? " row-over" : "")}
                  onDragOver={e => { if(dragId != null){ e.preventDefault(); if(overId !== o.id) setOverId(o.id); } }}
                  onDrop={e => { e.preventDefault(); moveObj(dragId, o.id); setDragId(null); setOverId(null); }}>
                  <td className="lbl">
                    {editObj === o.id ? (
                      <input className="name-input" autoFocus value={editVal} placeholder="Nombre del objetivo"
                        onChange={e => setEditVal(e.target.value)} onBlur={e => commitEdit(e.target.value)}
                        onKeyDown={e => { if(e.key === "Enter") e.target.blur(); if(e.key === "Escape"){ e.target.value = o.name; e.target.blur(); } }} />
                    ) : (
                      <div className="obj-name">
                        <span className="grip" draggable
                          onDragStart={e => { setDragId(o.id); try { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", String(o.id)); } catch(_) {} }}
                          onDragEnd={() => { setDragId(null); setOverId(null); }}
                          title="Arrastrar para reordenar">⠿</span>
                        <span onClick={() => startEdit(o)} style={{ cursor: "text" }}>{o.name || "Nuevo objetivo"}</span>
                        <span className="act">
                          <button className="iconbtn" title="Subir" disabled={oi === 0} onClick={() => moveBy(o.id, -1)}>↑</button>
                          <button className="iconbtn" title="Bajar" disabled={oi === objetivos.length - 1} onClick={() => moveBy(o.id, 1)}>↓</button>
                          <button className="iconbtn" title="Editar" onClick={() => startEdit(o)}>✎</button>
                          <button className="iconbtn del" title="Quitar" onClick={() => removeObj(o.id)}>✕</button>
                        </span>
                      </div>
                    )}
                    <div className="obj-sub">{objPct(o)}% · racha {objStreak(o)}</div>
                  </td>
                  {days.map(d => {
                    const st = cellState(o, viewY, viewM, d);
                    return <td key={d} className={weekSep(d).trim()}>
                      <div
                        className={"cell " + st + (t.showFails && st === "miss" ? " showfail" : "")}
                        style={dateClass(viewY, viewM, d) === "today" ? ring : undefined}
                        onClick={() => toggleCell(o.id, viewY, viewM, d)}
                        title={(o.name || "objetivo") + " · " + d + " " + MES[viewM]}
                      ></div>
                    </td>;
                  })}
                  <td className="pct">
                    <span className="v">{objPct(o)}%</span>
                    <div className="bar"><i style={{ width: objPct(o) + "%" }}></i></div>
                  </td>
                </tr>
              ))}
              <tr>
                <td className="lbl"><button className="add-obj" onClick={addObj}>+ añadir objetivo</button></td>
                <td colSpan={monthDays + 1}></td>
              </tr>
            </tbody>
          </table>
        </div>
        )}
      </div>

      {/* -------- tweaks -------- */}
      <TweaksPanel>
        <TweakSection label="Apariencia" />
        <TweakColor label="Acento" value={t.accent}
          options={[ACCENTS.evergreen, ACCENTS.indigo, ACCENTS.clay, ACCENTS.plum]}
          onChange={(v) => setTweak("accent", v)} />
        <TweakRadio label="Densidad" value={t.density} options={["Compacta","Cómoda"]}
          onChange={(v) => setTweak("density", v)} />
        <TweakSection label="Matriz" />
        <TweakToggle label="Fila resumen del día" value={t.showSummary} onChange={(v) => setTweak("showSummary", v)} />
        <TweakToggle label="Marcar fallos" value={t.showFails} onChange={(v) => setTweak("showFails", v)} />
        <TweakToggle label="Separar semanas" value={t.weekSeparators} onChange={(v) => setTweak("weekSeparators", v)} />
        {goals.length > 1 && <TweakButton label="Eliminar meta actual" onClick={deleteGoal} />}
        <TweakSection label="Datos" />
        <TweakButton label="Borrar progreso guardado" onClick={() => { try { localStorage.removeItem(LSKEY); } catch(_) {} location.reload(); }} />
      </TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
