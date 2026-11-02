import React, { useEffect, useMemo, useRef, useState } from "react";
import { Player, PlayerRef } from "@remotion/player";
import { StoryVideo } from "../remotion/StoryVideo";
import {
  ACTIONS, BACKGROUNDS, CAMERAS, CHARACTERS, EXPRESSIONS, FPS, GROUND_Y, HEIGHT, LIGHTS, PROPS, SFX, WIDTH,
  Actor, Project, PropItem, Scene, SfxId, uid,
} from "../shared/types";
import { TITLE_SECONDS, autoDuration, sceneFrames, sceneSeconds, totalFrames } from "../shared/timing";
import SAMPLE from "../../samples/fahad.txt?raw";

type Health = { llm: boolean; elevenlabs: boolean; espeak: boolean };

// مشاريع محفوظة بنسخة أقدم: تُكمَّل الحقول الجديدة
const withDefaults = (p: Project): Project => ({
  ...p, narrationOff: p.narrationOff ?? true, choices: p.choices ?? [],
  scenes: p.scenes.map((s) => ({ ...s, actors: s.actors.map((a) => ({ ...a, label: a.label ?? "" })) })),
});
const STORAGE = "horror-studio-project";

async function api<T>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, body === undefined ? undefined : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `خطأ ${res.status}`);
  return data as T;
}

function Select<T extends string>({ value, options, onChange }: { value: T; options: Record<T, string>; onChange: (v: T) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as T)}>
      {Object.entries(options).map(([k, v]) => <option key={k} value={k}>{v as string}</option>)}
    </select>
  );
}

export function App() {
  const [health, setHealth] = useState<Health | null>(null);
  const [story, setStory] = useState<string>(SAMPLE);
  const [title, setTitle] = useState("القرية التي لا يأتيها الفجر");
  const [engine, setEngine] = useState<"rules" | "llm">("rules");
  const [project, setProject] = useState<Project | null>(() => {
    try { const s = localStorage.getItem(STORAGE); return s ? withDefaults(JSON.parse(s)) : null; } catch { return null; }
  });
  const [sel, setSel] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [voice, setVoice] = useState<"espeak" | "elevenlabs">("espeak");
  const [voiceId, setVoiceId] = useState("");
  const [job, setJob] = useState<{ id: string; status: string; progress: number; file?: string; error?: string } | null>(null);
  const player = useRef<PlayerRef>(null);

  useEffect(() => { api<Health>("/api/health").then(setHealth).catch(() => setHealth(null)); }, []);
  useEffect(() => { try { if (project) localStorage.setItem(STORAGE, JSON.stringify(project)); } catch { /* تخزين غير متاح */ } }, [project]);

  const scene = project?.scenes[sel];
  const duration = project ? Math.max(30, totalFrames(project)) : 30;
  const sceneStart = (i: number) => Math.round(TITLE_SECONDS * FPS) + (project?.scenes.slice(0, i).reduce((n, s) => n + sceneFrames(s), 0) ?? 0);

  const updateScene = (patch: Partial<Scene>) => setProject((p) => p && { ...p, scenes: p.scenes.map((s, i) => (i === sel ? { ...s, ...patch } : s)) });
  const updateActor = (id: string, patch: Partial<Actor>) => scene && updateScene({ actors: scene.actors.map((a) => (a.id === id ? { ...a, ...patch } : a)) });
  const updateProp = (id: string, patch: Partial<PropItem>) => scene && updateScene({ props: scene.props.map((a) => (a.id === id ? { ...a, ...patch } : a)) });

  const select = (i: number) => { setSel(i); player.current?.seekTo(sceneStart(i) + 5); };

  async function generate() {
    setError(null); setBusy("جارٍ تحليل القصة وتقسيمها إلى مشاهد…");
    try {
      const r = await api<{ project: Project }>("/api/direct", { story, title, engine });
      setProject(r.project); setSel(0); setJob(null);
    } catch (e: any) { setError(e.message); } finally { setBusy(null); }
  }

  async function makeVoices() {
    if (!project) return;
    setError(null); setBusy("جارٍ توليد صوت الراوي…");
    try {
      const r = await api<{ clips: Record<string, { url: string; duration: number }> }>("/api/tts", {
        provider: voice, voiceId, scenes: project.scenes.map((s) => ({ id: s.id, text: s.text.replace(/[«»]/g, "") })),
      });
      setProject({ ...project, scenes: project.scenes.map((s) => ({ ...s, narration: r.clips[s.id] ?? s.narration })) });
    } catch (e: any) { setError(e.message); } finally { setBusy(null); }
  }

  async function uploadNarration(file: File) {
    const fd = new FormData(); fd.append("file", file);
    setBusy("جارٍ رفع الصوت…");
    try {
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      updateScene({ narration: data });
    } catch (e: any) { setError(e.message); } finally { setBusy(null); }
  }

  async function exportVideo() {
    if (!project) return;
    setError(null);
    try {
      const j = await api<typeof job & {}>("/api/render", { project });
      setJob(j);
      const poll = setInterval(async () => {
        const s = await api<typeof job & {}>(`/api/render/${j.id}`);
        setJob(s);
        if (s.status === "done" || s.status === "error") clearInterval(poll);
      }, 1000);
    } catch (e: any) { setError(e.message); }
  }

  function moveScene(d: -1 | 1) {
    if (!project) return;
    const j = sel + d;
    if (j < 0 || j >= project.scenes.length) return;
    const scenes = [...project.scenes];
    [scenes[sel], scenes[j]] = [scenes[j], scenes[sel]];
    setProject({ ...project, scenes }); setSel(j);
  }
  function addScene() {
    if (!project) return;
    const base = project.scenes[sel];
    const s: Scene = { ...structuredClone(base), id: uid(), text: "مشهد جديد", dialogue: null, narration: null };
    const scenes = [...project.scenes]; scenes.splice(sel + 1, 0, s);
    setProject({ ...project, scenes }); setSel(sel + 1);
  }
  function removeScene() {
    if (!project || project.scenes.length < 2) return;
    setProject({ ...project, scenes: project.scenes.filter((_, i) => i !== sel) }); setSel(Math.max(0, sel - 1));
  }

  function saveFile() {
    if (!project) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(project, null, 2)], { type: "application/json" }));
    a.download = `${project.title || "story"}.json`; a.click();
  }
  function loadFile(f: File) {
    f.text().then((t) => { const p = withDefaults(JSON.parse(t) as Project); setProject(p); setStory(p.story); setTitle(p.title); setSel(0); }).catch(() => setError("ملف غير صالح"));
  }

  const inputProps = useMemo(() => ({ project: project ?? { title: "", story: "", scenes: [], ambience: null, ambienceVolume: 0, narrationOff: true, choices: [] }, absoluteMedia: "" }), [project]);

  return (
    <div>
      <div className="top">
        <h1>استوديو قصص الرعب</h1>
        <span className="muted">اكتب القصة ← تُقسَّم مشاهد وتتحرك تلقائيًا ← راجع وعدّل ← صدّر MP4</span>
        <div className="badges">
          <span className={`badge ${health?.espeak ? "on" : ""}`}>صوت محلي espeak-ng: {health?.espeak ? "متاح" : "غير مثبت"}</span>
          <span className={`badge ${health?.llm ? "on" : ""}`}>مخرج Claude: {health?.llm ? "متاح" : "يحتاج ANTHROPIC_API_KEY"}</span>
          <span className={`badge ${health?.elevenlabs ? "on" : ""}`}>ElevenLabs: {health?.elevenlabs ? "متاح" : "يحتاج ELEVENLABS_API_KEY"}</span>
          {!health && <span className="badge" style={{ color: "var(--danger)" }}>الخادم غير متصل</span>}
        </div>
      </div>

      <div className="layout">
        {/* ١. القصة والمشاهد */}
        <div className="panel">
          <h2>١. القصة</h2>
          <label>العنوان</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} />
          <label>نص القصة (كل جملة تصبح مشهدًا تقريبًا)</label>
          <textarea rows={10} value={story} onChange={(e) => setStory(e.target.value)} />
          <label>المخرج</label>
          <select value={engine} onChange={(e) => setEngine(e.target.value as any)}>
            <option value="rules">محلي (قواعد وكلمات مفتاحية — بلا إنترنت)</option>
            <option value="llm" disabled={!health?.llm}>Claude (يحتاج ANTHROPIC_API_KEY)</option>
          </select>
          <div className="row" style={{ marginTop: 10 }}>
            <button className="primary" onClick={generate} disabled={!!busy}>أنشئ الرسوم المتحركة</button>
            <button onClick={saveFile} disabled={!project}>حفظ المشروع</button>
            <label className="chip" style={{ margin: 0 }}>فتح مشروع<input type="file" accept=".json" hidden onChange={(e) => e.target.files?.[0] && loadFile(e.target.files[0])} /></label>
          </div>
          {busy && <div className="muted" style={{ marginTop: 8 }}>{busy}</div>}
          {error && <div className="err">{error}</div>}

          {project && (
            <>
              <h3>المشاهد ({project.scenes.length})</h3>
              <div className="row">
                <button onClick={() => moveScene(-1)}>↑</button><button onClick={() => moveScene(1)}>↓</button>
                <button onClick={addScene}>+ مشهد</button><button className="danger" onClick={removeScene}>حذف</button>
              </div>
              <div className="scenes">
                {project.scenes.map((s, i) => (
                  <button key={s.id} className={`scene-item ${i === sel ? "sel" : ""}`} onClick={() => select(i)}>
                    <span className="n">{i + 1}</span>
                    <span className="t">{s.text}<div className="meta">{BACKGROUNDS[s.background]} · {sceneSeconds(s).toFixed(1)} ث{s.narration ? " · 🔊" : ""}</div></span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* ٢. المعاينة والتصدير */}
        <div className="panel player-wrap">
          <h2>٢. المعاينة</h2>
          {project ? (
            <div className="player" dir="ltr">
              <Player ref={player} component={StoryVideo} inputProps={inputProps} durationInFrames={duration} fps={FPS}
                compositionWidth={WIDTH} compositionHeight={HEIGHT} style={{ width: "100%", height: "100%" }} controls acknowledgeRemotionLicense />
            </div>
          ) : <div className="muted">اضغط «أنشئ الرسوم المتحركة» لتظهر المعاينة.</div>}
          {project && (
            <div style={{ width: "min(100%, 400px)" }}>
              <label className="chip" style={{ marginTop: 12 }}><input type="checkbox" checked={project.narrationOff} onChange={(e) => setProject({ ...project, narrationOff: e.target.checked })} />بدون صوت راوٍ (المؤثرات تبقى)</label>

              <h3>الخياران في النهاية</h3>
              <div className="grid2">
                <input placeholder="الخيار الأول (بنفسجي)" value={project.choices[0] ?? ""} onChange={(e) => setProject({ ...project, choices: [e.target.value, project.choices[1] ?? ""] })} />
                <input placeholder="الخيار الثاني" value={project.choices[1] ?? ""} onChange={(e) => setProject({ ...project, choices: [project.choices[0] ?? "", e.target.value] })} />
              </div>
              <div className="muted">اتركهما فارغين لإلغاء شاشة الخيارات.</div>

              {!project.narrationOff && <>
              <h3>صوت الراوي</h3>
              <div className="grid2">
                <select value={voice} onChange={(e) => setVoice(e.target.value as any)}>
                  <option value="espeak" disabled={!health?.espeak}>espeak-ng (مجاني، آلي)</option>
                  <option value="elevenlabs" disabled={!health?.elevenlabs}>ElevenLabs (طبيعي، مفتاح)</option>
                </select>
                {voice === "elevenlabs" ? <input placeholder="Voice ID" value={voiceId} onChange={(e) => setVoiceId(e.target.value)} /> : <span />}
              </div>
              <div className="row" style={{ marginTop: 8 }}>
                <button onClick={makeVoices} disabled={!!busy || (voice === "espeak" ? !health?.espeak : !health?.elevenlabs || !voiceId)}>ولّد الصوت لكل المشاهد</button>
                <button onClick={() => setProject({ ...project, scenes: project.scenes.map((s) => ({ ...s, narration: null })) })}>إزالة الأصوات</button>
              </div>
              <div className="muted">أو ارفع تسجيلك لكل مشهد من لوحة المشهد. المدة والترجمة تتبعان الصوت تلقائيًا.</div>
              </>}

              <h3>صوت الخلفية</h3>
              <div className="grid2">
                <select value={project.ambience ?? ""} onChange={(e) => setProject({ ...project, ambience: (e.target.value || null) as SfxId | null })}>
                  <option value="">بدون</option>
                  {Object.entries(SFX).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                <input type="range" min={0} max={1} step={0.05} value={project.ambienceVolume} onChange={(e) => setProject({ ...project, ambienceVolume: +e.target.value })} />
              </div>

              <h3>٣. التصدير</h3>
              <button className="primary" onClick={exportVideo} disabled={job?.status === "rendering"}>تصدير MP4 (1080×1920، 30 إطار/ث)</button>
              {job && (
                <div style={{ marginTop: 8 }}>
                  <div className="progress"><div style={{ width: `${Math.round(job.progress * 100)}%` }} /></div>
                  <div className="muted">{job.status === "rendering" ? `جارٍ التصدير ${Math.round(job.progress * 100)}%` : job.status === "done" ? "اكتمل التصدير" : job.status === "error" ? "" : "في الانتظار"}</div>
                  {job.error && <div className="err">{job.error}</div>}
                  {job.file && <><a href={job.file} download><button>تنزيل الفيديو</button></a><video src={job.file} controls /></>}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ٤. محرر المشهد */}
        <div className="panel">
          <h2>محرر المشهد {scene ? sel + 1 : ""}</h2>
          {!scene ? <div className="muted">اختر مشهدًا لتعديله.</div> : (
            <div>
              <label>نص الراوي / الترجمة</label>
              <textarea rows={3} value={scene.text} onChange={(e) => updateScene({ text: e.target.value })} />
              <label>حوار (اختياري)</label>
              <div className="grid2">
                <input placeholder="المتحدث" value={scene.dialogue?.speaker ?? ""} onChange={(e) => updateScene({ dialogue: { speaker: e.target.value, line: scene.dialogue?.line ?? "", whisper: scene.dialogue?.whisper ?? false } })} />
                <label className="chip" style={{ margin: 0 }}><input type="checkbox" checked={scene.dialogue?.whisper ?? false} onChange={(e) => updateScene({ dialogue: { speaker: scene.dialogue?.speaker ?? "", line: scene.dialogue?.line ?? "", whisper: e.target.checked } })} />همس</label>
              </div>
              <input style={{ marginTop: 6 }} placeholder="نص الحوار" value={scene.dialogue?.line ?? ""} onChange={(e) => updateScene({ dialogue: e.target.value ? { speaker: scene.dialogue?.speaker ?? "", line: e.target.value, whisper: scene.dialogue?.whisper ?? false } : null })} />

              <div className="grid2">
                <div><label>الخلفية</label><Select value={scene.background} options={BACKGROUNDS} onChange={(v) => updateScene({ background: v })} /></div>
                <div><label>الكاميرا</label><Select value={scene.camera} options={CAMERAS} onChange={(v) => updateScene({ camera: v })} /></div>
                <div><label>الإضاءة</label><Select value={scene.light} options={LIGHTS} onChange={(v) => updateScene({ light: v })} /></div>
                <div>
                  <label>المدة (ثانية)</label>
                  <div className="row">
                    <input type="number" min={1} max={30} step={0.5} style={{ width: 80 }} disabled={scene.autoDuration} value={scene.autoDuration ? autoDuration(scene).toFixed(1) : scene.duration} onChange={(e) => updateScene({ duration: +e.target.value })} />
                    <label className="chip" style={{ margin: 0 }}><input type="checkbox" checked={scene.autoDuration} onChange={(e) => updateScene({ autoDuration: e.target.checked, duration: autoDuration(scene) })} />تلقائي</label>
                  </div>
                </div>
              </div>
              <label className="chip" style={{ marginTop: 8 }}><input type="checkbox" checked={scene.villageLit} onChange={(e) => updateScene({ villageLit: e.target.checked })} />نوافذ القرية مضيئة</label>

              <h3>صوت الراوي لهذا المشهد</h3>
              <div className="row">
                {scene.narration ? <span className="muted">🔊 {scene.narration.duration.toFixed(1)} ث</span> : <span className="muted">لا يوجد</span>}
                <label className="chip" style={{ margin: 0 }}>رفع تسجيل<input type="file" accept="audio/*" hidden onChange={(e) => e.target.files?.[0] && uploadNarration(e.target.files[0])} /></label>
                {scene.narration && <button onClick={() => updateScene({ narration: null })}>إزالة</button>}
              </div>

              <h3>الشخصيات</h3>
              {scene.actors.map((a) => (
                <div className="card" key={a.id}>
                  <div className="grid2">
                    <Select value={a.character} options={CHARACTERS} onChange={(v) => updateActor(a.id, { character: v })} />
                    <Select value={a.action} options={ACTIONS} onChange={(v) => updateActor(a.id, { action: v })} />
                    <Select value={a.expression} options={EXPRESSIONS} onChange={(v) => updateActor(a.id, { expression: v })} />
                    <select value={a.facing} onChange={(e) => updateActor(a.id, { facing: e.target.value as any })}>
                      <option value="left">يتجه لليسار</option><option value="right">يتجه لليمين</option><option value="back">ظهره للكاميرا</option>
                    </select>
                  </div>
                  <input style={{ marginTop: 6 }} placeholder="اسم يظهر فوقه (اختياري)" value={a.label} onChange={(e) => updateActor(a.id, { label: e.target.value })} />
                  <label>البداية: {Math.round(a.x0)} — النهاية: {Math.round(a.x1)}</label>
                  <div className="grid2">
                    <input type="range" min={-200} max={1280} value={a.x0} onChange={(e) => updateActor(a.id, { x0: +e.target.value })} />
                    <input type="range" min={-200} max={1280} value={a.x1} onChange={(e) => updateActor(a.id, { x1: +e.target.value })} />
                  </div>
                  <div className="row" style={{ marginTop: 6 }}>
                    <label style={{ margin: 0 }}>الحجم</label>
                    <input type="range" min={0.4} max={1.6} step={0.05} value={a.scale} onChange={(e) => updateActor(a.id, { scale: +e.target.value })} style={{ flex: 1 }} />
                    <button className="danger" onClick={() => updateScene({ actors: scene.actors.filter((x) => x.id !== a.id) })}>حذف</button>
                  </div>
                </div>
              ))}
              <button onClick={() => updateScene({ actors: [...scene.actors, { id: uid(), character: "hero", action: "idle", x0: 540, x1: 540, facing: "left", expression: "neutral", scale: 1, label: "" }] })}>+ شخصية</button>

              <h3>الأشياء</h3>
              {scene.props.map((p) => (
                <div className="card" key={p.id}>
                  <div className="grid3">
                    <Select value={p.kind} options={PROPS} onChange={(v) => updateProp(p.id, { kind: v })} />
                    <input placeholder="الحالة" value={p.state} onChange={(e) => updateProp(p.id, { state: e.target.value })} title="الساعة: 3:00 — الهاتف: ringing — المصباح: on/off — السيارة: moving/broken/parked" />
                    <button className="danger" onClick={() => updateScene({ props: scene.props.filter((x) => x.id !== p.id) })}>حذف</button>
                  </div>
                  <div className="grid2" style={{ marginTop: 6 }}>
                    <input type="range" min={-100} max={1180} value={p.x} onChange={(e) => updateProp(p.id, { x: +e.target.value })} />
                    <input type="range" min={300} max={1700} value={p.y} onChange={(e) => updateProp(p.id, { y: +e.target.value })} />
                  </div>
                </div>
              ))}
              <button onClick={() => updateScene({ props: [...scene.props, { id: uid(), kind: "lamp", x: 540, y: GROUND_Y - 300, scale: 1, state: "on" }] })}>+ شيء</button>

              <h3>المؤثرات الصوتية</h3>
              <div className="chips">
                {(Object.keys(SFX) as SfxId[]).map((k) => (
                  <span key={k} className={`chip ${scene.sfx.includes(k) ? "on" : ""}`} onClick={() => updateScene({ sfx: scene.sfx.includes(k) ? scene.sfx.filter((x) => x !== k) : [...scene.sfx, k] })}>{SFX[k]}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
