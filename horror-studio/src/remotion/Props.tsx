// أشياء المشهد: سيارة، ساعة، هاتف، مصباح، مقعد، ظل في النافذة، عيون، دخان — كلها أشكال مسطحة.
import React from "react";
import { interpolate, Easing } from "remotion";
import { PropItem } from "../shared/types";

// السيارة: تتحرك مع القيادة، وتهتز وتتوقف عند التعطل، ويظهر رأس السائق من النافذة
export function Car({ x, y, frame, frames, mode, driver }: { x: number; y: number; frame: number; frames: number; mode: "moving" | "stopping" | "broken" | "parked"; driver: boolean }) {
  const moving = mode === "moving" || (mode === "stopping" && frame < frames * 0.45);
  const spin = moving ? frame * (mode === "stopping" ? interpolate(frame, [0, frames * 0.45], [14, 0], { extrapolateRight: "clamp" }) : 14) : 0;
  const bounce = moving ? Math.sin(frame * 0.9) * 2 : 0;
  const jolt = mode === "stopping" && frame > frames * 0.4 && frame < frames * 0.6 ? Math.sin(frame * 3) * 5 : 0;
  const wheel = (cx: number) => (
    <g transform={`translate(${cx} -34) rotate(${spin})`}>
      <circle r={34} fill="#141418" /><circle r={14} fill="#8e8e96" />
      <rect x={-3} y={-30} width={6} height={60} fill="#141418" />
    </g>
  );
  return (
    <g transform={`translate(${x + jolt} ${y + bounce})`}>
      <ellipse cx={0} cy={0} rx={190} ry={12} fill="#000" opacity={0.25} />
      <path d="M -190 -40 L -190 -110 L -120 -118 L -70 -180 L 80 -180 L 130 -118 L 190 -108 L 190 -40 Z" fill="#c9c3b8" />
      <path d="M -60 -168 L 70 -168 L 108 -120 L -102 -120 Z" fill="#1d2235" />
      <rect x={-6} y={-168} width={10} height={48} fill="#c9c3b8" />
      {driver && (
        <g>
          <circle cx={48} cy={-138} r={20} fill="#d9a77c" />
          <path d="M 26 -142 Q 48 -172 70 -142 L 74 -120 L 22 -120 Z" fill="#b8312f" />
          <circle cx={42} cy={-136} r={3} fill="#1a1412" />
        </g>
      )}
      <rect x={-196} y={-62} width={392} height={18} fill="#9d978c" />
      <rect x={170} y={-100} width={20} height={14} fill={mode === "broken" ? "#5a4a2a" : "#f2e7a8"} />
      {wheel(-115)}{wheel(115)}
    </g>
  );
}

function Clock({ state, frame, s }: { state: string; frame: number; s: number }) {
  const [h, m] = state.split(":").map((v) => parseInt(v, 10) || 0);
  // العقرب يحاول التقدم ثم يرتد: الوقت متجمد
  const twitch = Math.floor(frame / 15) % 2 === 0 ? 0 : 6;
  const minA = m * 6 + twitch, hourA = (h % 12) * 30 + m * 0.5;
  return (
    <g transform={`scale(${s})`}>
      <circle r={86} fill="#efe6d2" stroke="#3b2a20" strokeWidth={12} />
      {Array.from({ length: 12 }, (_, i) => <rect key={i} x={-3} y={-74} width={6} height={14} fill="#3b2a20" transform={`rotate(${i * 30})`} />)}
      <rect x={-5} y={-46} width={10} height={50} rx={5} fill="#1d1d1d" transform={`rotate(${hourA})`} />
      <rect x={-3.5} y={-66} width={7} height={70} rx={3.5} fill="#7a1f1f" transform={`rotate(${minA})`} />
      <circle r={8} fill="#1d1d1d" />
    </g>
  );
}

export function Prop({ p, frame, frames }: { p: PropItem; frame: number; frames: number }) {
  switch (p.kind) {
    case "car":
      return <Car x={p.x} y={p.y} frame={frame} frames={frames} mode={p.state === "moving" ? "moving" : p.state === "broken" ? "broken" : "parked"} driver={false} />;
    case "clock":
      return <g transform={`translate(${p.x} ${p.y})`}><Clock state={p.state || "3:00"} frame={frame} s={p.scale} /></g>;
    case "phone": {
      const ringing = p.state === "ringing";
      const buzz = ringing ? Math.sin(frame * 2.5) * 3 : 0;
      return (
        <g transform={`translate(${p.x + buzz} ${p.y}) scale(${p.scale})`}>
          <rect x={-24} y={-44} width={48} height={88} rx={8} fill="#14161c" />
          <rect x={-18} y={-34} width={36} height={62} fill={ringing && Math.floor(frame / 6) % 2 ? "#9fd3ff" : "#2c3147"} />
          {ringing && [1, 2].map((i) => <path key={i} d={`M ${30 + i * 14} -30 Q ${44 + i * 16} 0 ${30 + i * 14} 30`} stroke="#f2c94c" strokeWidth={5} fill="none" opacity={(Math.floor(frame / 5) + i) % 2 ? 1 : 0.3} />)}
        </g>
      );
    }
    case "lamp": {
      const on = p.state !== "off";
      return (
        <g transform={`translate(${p.x} ${p.y}) scale(${p.scale})`}>
          <rect x={-3} y={-260} width={6} height={260} fill="#151515" />
          <path d="M -40 0 L 40 0 L 24 -50 L -24 -50 Z" fill={on ? "#f2c94c" : "#5a5040"} />
          {on && <polygon points="-40,0 40,0 120,500 -120,500" fill="#f2c94c" opacity={0.08} />}
        </g>
      );
    }
    case "bench":
      return (
        <g transform={`translate(${p.x} ${p.y}) scale(${p.scale})`}>
          <rect x={-120} y={-96} width={240} height={22} fill="#6b4a33" />
          <rect x={-110} y={-74} width={16} height={74} fill="#523825" />
          <rect x={94} y={-74} width={16} height={74} fill="#523825" />
        </g>
      );
    case "windowShadow": {
      // ظل امرأة بعباءة يظهر في نافذة الغرفة ويقترب
      const o = interpolate(frame, [0, frames * 0.5], [0, 1], { extrapolateRight: "clamp" });
      return (
        <g transform="translate(760 1014)" opacity={o}>
          <path d="M -46 0 Q -50 -150 -26 -190 Q 0 -230 26 -190 Q 50 -150 46 0 Z" fill="#05060a" />
          <circle cx={-10} cy={-170} r={3.5} fill="#e9e9e9" /><circle cx={10} cy={-170} r={3.5} fill="#e9e9e9" />
        </g>
      );
    }
    case "eyes":
      return (
        <g transform={`translate(${p.x} ${p.y})`} opacity={Math.floor(frame / 40) % 4 === 3 ? 0 : 1}>
          {[[-200, 0], [-170, 0], [180, -60], [210, -60], [-20, 120], [10, 120]].map(([x, y], i) => <ellipse key={i} cx={x} cy={y} rx={9} ry={5} fill="#f4f4f4" />)}
        </g>
      );
    case "smoke":
      return (
        <g>
          {[0, 1, 2, 3].map((i) => {
            const t = ((frame + i * 12) % 48) / 48;
            return <circle key={i} cx={p.x + 120 + Math.sin(t * 6 + i) * 20} cy={p.y - 40 - t * 260} r={20 + t * 40} fill="#9a9aa2" opacity={(1 - t) * interpolate(frame, [0, 20], [0, 0.8], { extrapolateRight: "clamp", easing: Easing.out(Easing.quad) })} />;
          })}
        </g>
      );
  }
}
