// يرسم مشهدًا واحدًا: خلفية + شخصيات + أشياء + كاميرا + إضاءة + ترجمة.
import React from "react";
import { AbsoluteFill, interpolate, Easing, useCurrentFrame } from "remotion";
import { Scene, WIDTH, HEIGHT } from "../shared/types";
import { sceneFrames, subtitleChunks } from "../shared/timing";
import { background } from "./Backgrounds";
import { Character, actorX } from "./Character";
import { Car, Prop } from "./Props";

const AR_FONT = "Kufi, 'Noto Kufi Arabic', 'IBM Plex Sans Arabic', sans-serif";

function camera(s: Scene, frame: number, frames: number, focusX: number) {
  const p = interpolate(frame, [0, frames], [0, 1], { extrapolateRight: "clamp", easing: Easing.inOut(Easing.quad) });
  let scale = 1, tx = 0, ty = 0;
  const fx = Math.max(-140, Math.min(140, 540 - focusX)); // تتبّع الشخصية الرئيسية
  switch (s.camera) {
    case "zoomIn": scale = 1 + 0.2 * p; tx = fx * p * 0.8; ty = 60 * p; break;
    case "zoomOut": scale = 1.22 - 0.22 * p; tx = fx * (1 - p) * 0.6; break;
    case "panLeft": tx = fx; scale = 1.04; break;
    case "panRight": tx = interpolate(p, [0, 1], [-80, 80]); scale = 1.04; break;
    case "shake": scale = 1.06 + 0.04 * p; tx = Math.sin(frame * 1.9) * 9 + Math.sin(frame * 0.7) * 5; ty = Math.cos(frame * 2.3) * 7; break;
    case "static": break;
  }
  return `translate(${WIDTH / 2 + tx} ${HEIGHT / 2 + ty}) scale(${scale}) translate(${-WIDTH / 2} ${-HEIGHT / 2})`;
}

function lightOpacity(s: Scene, frame: number) {
  switch (s.light) {
    case "normal": return 0;
    case "dark": return 0.32;
    case "off": return 0.62;
    case "flicker": {
      const h = Math.sin(Math.floor(frame / 3) * 12.9898) * 43758.5453;
      return h - Math.floor(h) > 0.62 ? 0.78 : 0.18;
    }
  }
}

export function SceneView({ scene, hideText = false }: { scene: Scene; hideText?: boolean }) {
  const frame = useCurrentFrame();
  const frames = sceneFrames(scene);
  const opening = scene.actors.find((a) => a.action === "openDoor");
  const doorOpen = opening ? interpolate(frame, [frames * 0.2, frames * 0.6], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) : 0;
  const lamp = scene.props.find((p) => p.kind === "lamp");
  const bg = background(scene.background, { lit: scene.villageLit, lampOn: lamp ? lamp.state !== "off" : false, doorOpen });

  const driver = scene.actors.find((a) => a.action === "drive" || a.action === "carStop");
  const handPhone = scene.actors.some((a) => a.action === "phone");
  const props = scene.props.filter((p) => !(p.kind === "car" && driver) && !(p.kind === "phone" && handPhone));
  const behind = props.filter((p) => p.kind === "bench" || p.kind === "car" || p.kind === "lamp" || p.kind === "clock" || p.kind === "windowShadow");
  const front = props.filter((p) => !behind.includes(p));

  const main = scene.actors.find((a) => a.character === "hero") ?? scene.actors[0];
  const focusX = main ? actorX({ ...main, frame, frames }) : 540;

  const actors = scene.actors.filter((a) => a !== driver).map((a) => (
    <Character key={a.id} character={a.character} action={a.action} expression={a.expression} facing={a.facing}
      frame={frame} frames={frames} x0={a.x0} x1={a.x1} groundY={bg.groundY} scale={a.scale * 1.3} />
  ));

  // الترجمة: أسطر قصيرة موزعة على زمن النطق
  const chunks = subtitleChunks(scene.text);
  const speech = scene.narration ? Math.round(scene.narration.duration * 30) : frames - 12;
  const idx = Math.min(chunks.length - 1, Math.floor((frame / Math.max(1, speech)) * chunks.length));
  const fadeIn = interpolate(frame, [0, 8], [1, 0], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      <svg width={WIDTH} height={HEIGHT} viewBox={`0 0 ${WIDTH} ${HEIGHT}`}>
        <defs>{bg.clip && <clipPath id={`clip-${scene.id}`}><rect x={bg.clip.x} y={bg.clip.y} width={bg.clip.w} height={bg.clip.h} /></clipPath>}</defs>
        <g transform={camera(scene, frame, frames, focusX)}>
          {bg.back}
          {behind.map((p) => <Prop key={p.id} p={p} frame={frame} frames={frames} />)}
          {driver && (
            <Car x={actorX({ ...driver, frame, frames })} y={bg.groundY + 40} frame={frame} frames={frames}
              mode={driver.action === "carStop" ? "stopping" : "moving"} driver />
          )}
          <g clipPath={bg.clip ? `url(#clip-${scene.id})` : undefined}>{actors}</g>
          {front.map((p) => <Prop key={p.id} p={p} frame={frame} frames={frames} />)}
          {bg.front}
        </g>
        <rect width={WIDTH} height={HEIGHT} fill="#03040c" opacity={lightOpacity(scene, frame)} />
        <rect width={WIDTH} height={HEIGHT} fill="#000" opacity={fadeIn} />
      </svg>

      {/* بطاقة اسم الشخصية أول ظهورها */}
      {!hideText && scene.actors.filter((a) => a.label).map((a) => {
        const inCar = a === driver;
        const x = actorX({ ...a, frame, frames });
        const top = inCar ? bg.groundY - 300 : bg.groundY - 560 * a.scale;
        const o = interpolate(frame, [8, 18, frames * 0.75, frames * 0.75 + 10], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
        return (
          <div key={a.id} style={{ position: "absolute", left: x, top, transform: `translate(-50%, ${(1 - o) * 20}px)`, opacity: o,
            background: "#e9e1cc", color: "#1b1d27", fontFamily: AR_FONT, fontWeight: 800, fontSize: 50, padding: "6px 28px", borderRadius: 18, direction: "rtl", whiteSpace: "nowrap" }}>
            {a.label}
            <div style={{ position: "absolute", left: "50%", bottom: -14, marginLeft: -14, width: 0, height: 0, borderLeft: "14px solid transparent", borderRight: "14px solid transparent", borderTop: "14px solid #e9e1cc" }} />
          </div>
        );
      })}

      {!hideText && scene.dialogue && frame > 6 && (
        <div style={{ position: "absolute", top: 230, left: 60, right: 60, direction: "rtl", textAlign: "center", fontFamily: AR_FONT }}>
          <div style={{ display: "inline-block", fontSize: 34, color: "#e8d9a8", marginBottom: 14 }}>{scene.dialogue.speaker}</div>
          <div style={{
            fontSize: scene.dialogue.whisper ? 64 : 58, fontWeight: 800, lineHeight: 1.5,
            color: scene.dialogue.whisper ? "#e14b4b" : "#ffffff",
            transform: scene.dialogue.whisper ? `translate(${Math.sin(frame * 1.7) * 2}px, ${Math.cos(frame * 2.1) * 2}px)` : undefined,
            textShadow: "0 0 0 #000, 3px 3px 0 #000",
          }}>«{scene.dialogue.line}»</div>
        </div>
      )}

      {!hideText && <div style={{ position: "absolute", bottom: 210, left: 50, right: 50, display: "flex", justifyContent: "center", direction: "rtl" }}>
        <div style={{ background: "rgba(0,0,0,.72)", color: "#fff", fontFamily: AR_FONT, fontWeight: 700, fontSize: 52, lineHeight: 1.6, padding: "12px 30px", borderRadius: 14, textAlign: "center" }}>
          {chunks[idx] ?? ""}
        </div>
      </div>}
    </AbsoluteFill>
  );
}
