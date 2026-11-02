// هيكل شخصية SVG بسيط (ثوب، شماغ، رأس، ذراعان، قدمان) مع قوالب حركة قابلة لإعادة الاستخدام.
import React from "react";
import { interpolate, Easing } from "remotion";
import { ActionId, CharacterId, ExpressionId } from "../shared/types";

type Look = { thobe: string; skin: string; head: "shemagh" | "ghutra" | "cap" | "none"; headColor: string; beard: string | null; bisht: string | null; eyes: string };
const LOOKS: Record<CharacterId, Look> = {
  hero: { thobe: "#f3f1ea", skin: "#d9a77c", head: "shemagh", headColor: "#b8312f", beard: "#2a1d17", bisht: null, eyes: "#1a1412" },
  elder: { thobe: "#e9e3d3", skin: "#c8956c", head: "ghutra", headColor: "#f3f1ea", beard: "#e6e2da", bisht: "#5b3f28", eyes: "#1a1412" },
  child: { thobe: "#f3f1ea", skin: "#e0b48a", head: "cap", headColor: "#f3f1ea", beard: null, bisht: null, eyes: "#1a1412" },
  villager: { thobe: "#cfc4ad", skin: "#9c8b80", head: "ghutra", headColor: "#e9e5dc", beard: null, bisht: null, eyes: "#0b0b0b" },
  mother: { thobe: "#0d0d12", skin: "#0d0d12", head: "none", headColor: "#0d0d12", beard: null, bisht: null, eyes: "#f4f4f4" },
  figure: { thobe: "#08080c", skin: "#08080c", head: "none", headColor: "#08080c", beard: null, bisht: null, eyes: "#f4f4f4" },
  double: { thobe: "#2b2b35", skin: "#3a3a46", head: "shemagh", headColor: "#3d1515", beard: "#111", bisht: null, eyes: "#f4f4f4" },
};

export type CharacterProps = {
  character: CharacterId; action: ActionId; expression: ExpressionId; facing: "left" | "right" | "back";
  frame: number; frames: number; x0: number; x1: number; groundY: number; scale: number;
};

// موضع الشخصية الأفقي عبر الزمن (المشي والركض ينتهيان عند 85% من المشهد)
export function actorX(p: Pick<CharacterProps, "action" | "frame" | "frames" | "x0" | "x1">) {
  if (p.x0 === p.x1) return p.x0;
  const end = Math.max(10, p.frames * (p.action === "run" ? 0.7 : 0.85));
  return interpolate(p.frame, [0, end], [p.x0, p.x1], { extrapolateRight: "clamp", easing: Easing.inOut(Easing.quad) });
}

export function Character(p: CharacterProps) {
  const L = LOOKS[p.character];
  const f = p.frame;
  const x = actorX(p);
  const moving = (p.action === "walk" || p.action === "run") && p.x0 !== p.x1 && Math.abs(x - p.x1) > 2;
  const ghost = p.character === "mother" || p.character === "figure";

  // الاتجاه: الحركة تحدد الاتجاه، والالتفات يقلبه في منتصف المشهد
  let facing = p.facing;
  if (moving) facing = p.x1 < p.x0 ? "left" : "right";
  if (p.action === "turn" && f > p.frames * 0.4) facing = facing === "left" ? "right" : facing === "right" ? "left" : "left";
  const flip = facing === "right" ? -1 : 1; // الرسم الأساسي يتجه لليسار

  // قيم الحركة
  const speed = p.action === "run" ? 0.42 : 0.24;
  const ph = f * speed;
  let bob = 0, lean = 0, armB = 6, armF = -6, footB = 0, footF = 0, liftB = 0, liftF = 0, shakeX = 0, headTilt = 0, y = 0, opacity = 1;
  let mouthOpen = false;
  const amp = p.action === "run" ? 1.7 : 1;
  if (moving) {
    bob = Math.abs(Math.sin(ph)) * -5 * amp;
    armB = Math.sin(ph) * 22 * amp; armF = -armB;
    footB = Math.sin(ph) * 14 * amp; footF = -footB;
    liftB = Math.max(0, Math.cos(ph)) * -6 * amp; liftF = Math.max(0, -Math.cos(ph)) * -6 * amp;
    lean = p.action === "run" ? -8 : -2;
  } else if (p.action === "freeze") {
    // بلا أي حركة
  } else if (p.action === "float") {
    y = Math.sin(f / 14) * 10 - 14; opacity = 0.82;
  } else {
    bob = Math.sin(f / 18) * 1.5; // تنفس خفيف
  }
  if (p.action === "scared") { shakeX = Math.sin(f * 2.3) * 3; armB = -38; armF = -46; headTilt = Math.sin(f * 1.7) * 2; }
  if (p.action === "talk") { mouthOpen = Math.floor(f / 5) % 2 === 0 && f < p.frames - 10; armF = -20 + Math.sin(f / 6) * 18; }
  if (p.action === "look") headTilt = interpolate(f, [0, 12], [0, -7], { extrapolateRight: "clamp" }) + Math.sin(f / 25) * 2;
  if (p.action === "openDoor") armF = interpolate(f, [0, p.frames * 0.3], [-6, -82], { extrapolateRight: "clamp" });
  if (p.action === "phone") { armF = 158; headTilt = -4; shakeX = Math.sin(f * 2.1) * 1.5; }
  const turning = p.action === "turn" && Math.abs(f - p.frames * 0.4) < 4;
  const squash = turning ? 0.9 : 1;
  const sit = p.action === "sit";

  const expr: ExpressionId = p.action === "scared" || p.action === "phone" ? "scared" : p.expression;

  // الأبعاد (الأصل عند القدمين)
  const shoulderY = sit ? -205 : -295;
  const headY = shoulderY - 52;

  const arm = (rot: number, side: number) => (
    <g transform={`translate(${side * 30} ${shoulderY + 10}) rotate(${rot})`}>
      {(() => {
        // الجوال على الأذن: ذراع أقصر من الجنب حتى لا تغطي الوجه
        const len = p.action === "phone" && side === -1 ? 78 : sit ? 90 : 108;
        return (
          <>
            <rect x={-9} y={-4} width={18} height={len} rx={9} fill={L.bisht ?? L.thobe} />
            {p.action === "phone" && side === -1 && <rect x={-11} y={len - 26} width={22} height={40} rx={5} fill="#14161c" />}
            {p.action === "phone" && side === -1 && <rect x={-7} y={len - 21} width={14} height={28} rx={2} fill={Math.floor(f / 8) % 2 ? "#9fd3ff" : "#5f7fa8"} />}
            {!ghost && <circle cx={0} cy={len - 2} r={9} fill={L.skin} />}
          </>
        );
      })()}
    </g>
  );

  const face = () => {
    if (facing === "back" || L.head === "none") {
      return ghost ? (
        <g>
          <circle cx={-12} cy={headY + 2} r={4.5} fill={L.eyes} />
          <circle cx={12} cy={headY + 2} r={4.5} fill={L.eyes} />
        </g>
      ) : null;
    }
    const dx = -6; // الملامح تميل نحو الاتجاه
    const big = expr === "scared";
    return (
      <g>
        {big ? (
          <>
            <circle cx={dx - 13} cy={headY} r={7} fill="#fff" /><circle cx={dx + 11} cy={headY} r={7} fill="#fff" />
            <circle cx={dx - 14} cy={headY} r={3} fill={L.eyes} /><circle cx={dx + 10} cy={headY} r={3} fill={L.eyes} />
          </>
        ) : (
          <>
            <circle cx={dx - 13} cy={headY} r={expr === "blank" ? 3 : 4} fill={L.eyes} />
            <circle cx={dx + 11} cy={headY} r={expr === "blank" ? 3 : 4} fill={L.eyes} />
          </>
        )}
        {expr !== "blank" && (
          <>
            <rect x={dx - 21} y={headY - (big ? 17 : 13)} width={14} height={3.5} rx={2} fill={L.beard ?? "#5a3d2b"} transform={big ? `rotate(-10 ${dx - 14} ${headY - 15})` : undefined} />
            <rect x={dx + 4} y={headY - (big ? 17 : 13)} width={14} height={3.5} rx={2} fill={L.beard ?? "#5a3d2b"} transform={big ? `rotate(10 ${dx + 11} ${headY - 15})` : undefined} />
          </>
        )}
        {L.beard && p.character !== "elder" && <path d={`M ${-30} ${headY + 6} Q 0 ${headY + 52} 30 ${headY + 6} Q 0 ${headY + 34} -30 ${headY + 6} Z`} fill={L.beard} />}
        {L.beard && p.character === "elder" && <path d={`M ${-30} ${headY + 4} Q 0 ${headY + 90} 30 ${headY + 4} Q 0 ${headY + 30} -30 ${headY + 4} Z`} fill={L.beard} />}
        {expr === "scared" || mouthOpen ? (
          <ellipse cx={dx} cy={headY + 21} rx={mouthOpen ? 7 : 6} ry={mouthOpen ? 6 : 8} fill="#2a1414" />
        ) : expr === "smile" ? (
          <path d={`M ${dx - 9} ${headY + 17} Q ${dx} ${headY + 26} ${dx + 9} ${headY + 17}`} stroke="#2a1414" strokeWidth={3.5} fill="none" strokeLinecap="round" />
        ) : expr === "neutral" ? (
          <rect x={dx - 8} y={headY + 18} width={16} height={3.5} rx={2} fill="#2a1414" />
        ) : null}
        {expr === "scared" && p.character !== "double" && [0, 1, 2].map((i) => {
          const t = ((f + i * 11) % 33) / 33;
          const sx = [36, -38, 28][i], sy = headY - 18 + [0, 4, 10][i];
          return <path key={i} d={`M ${sx} ${sy + t * 50} q 9 14 0 22 q -9 -8 0 -22 Z`} fill="#8fc5e8" opacity={1 - t * 0.7} />;
        })}
      </g>
    );
  };

  const headwear = (front: boolean) => {
    if (L.head === "none") {
      return front ? null : <path d={`M -40 ${headY + 10} Q -44 ${headY - 50} 0 ${headY - 52} Q 44 ${headY - 50} 40 ${headY + 10} L 46 ${shoulderY + 30} L -46 ${shoulderY + 30} Z`} fill={L.headColor} />;
    }
    if (L.head === "cap") return front ? <path d={`M -34 ${headY - 8} Q 0 ${headY - 50} 34 ${headY - 8} Z`} fill={L.headColor} /> : null;
    if (!front) // الجزء المنسدل خلف الرأس حتى الكتفين
      return <path d={`M -44 ${headY - 4} L -52 ${shoulderY + 22} L 52 ${shoulderY + 22} L 44 ${headY - 4} Z`} fill={L.headColor} />;
    return (
      <g>
        <path d={`M -44 ${headY + (facing === "back" ? 40 : 2)} Q -46 ${headY - 52} 0 ${headY - 54} Q 46 ${headY - 52} 44 ${headY + (facing === "back" ? 40 : 2)} L 36 ${headY - 8} Q 0 ${headY - 34} -36 ${headY - 8} Z`} fill={L.headColor} />
        {facing === "back" && <path d={`M -44 ${headY - 10} Q 0 ${headY - 56} 44 ${headY - 10} L 50 ${shoulderY + 24} L -50 ${shoulderY + 24} Z`} fill={L.headColor} />}
        <rect x={-38} y={headY - 40} width={76} height={9} rx={4.5} fill="#151515" />
      </g>
    );
  };

  const body = sit ? (
    <g>
      <path d={`M -38 ${shoulderY} L 38 ${shoulderY} L 46 -90 L -46 -90 Z`} fill={L.thobe} />
      <rect x={-96} y={-108} width={110} height={40} rx={18} fill={L.thobe} />
      <ellipse cx={-96} cy={-74} rx={18} ry={9} fill="#3a2a20" />
      {L.bisht && <path d={`M -40 ${shoulderY} L -12 ${shoulderY} L -18 -92 L -48 -92 Z M 40 ${shoulderY} L 12 ${shoulderY} L 18 -92 L 48 -92 Z`} fill={L.bisht} />}
    </g>
  ) : (
    <g>
      <ellipse cx={14 + footB} cy={-4 + liftB} rx={17} ry={7} fill="#3a2a20" />
      <ellipse cx={-14 + footF} cy={-4 + liftF} rx={17} ry={7} fill="#3a2a20" />
      <path d={ghost ? `M -36 ${shoulderY} L 36 ${shoulderY} L 62 -6 Q 0 8 -62 -6 Z` : `M -38 ${shoulderY} L 38 ${shoulderY} L 50 -12 L -50 -12 Z`} fill={L.thobe} />
      {L.bisht && <path d={`M -40 ${shoulderY} L -12 ${shoulderY} L -22 -14 L -56 -14 Z M 40 ${shoulderY} L 12 ${shoulderY} L 22 -14 L 56 -14 Z`} fill={L.bisht} />}
      {p.character === "elder" && <rect x={-86} y={shoulderY + 70} width={8} height={230} rx={4} fill="#4a3322" />}
    </g>
  );

  return (
    <g transform={`translate(${x + shakeX} ${p.groundY + y}) scale(${p.scale * flip * squash} ${p.scale})`} opacity={opacity}>
      <ellipse cx={0} cy={0} rx={60} ry={10} fill="#000" opacity={ghost ? 0.15 : 0.22} />
      <g transform={`translate(0 ${bob}) rotate(${lean} 0 0)`}>
        {arm(armB, 1)}
        {body}
        <g transform={`rotate(${headTilt} 0 ${shoulderY})`}>
          {headwear(false)}
          {!ghost && <rect x={-10} y={shoulderY - 22} width={20} height={26} fill={L.skin} />}
          {L.head !== "none" && <circle cx={0} cy={headY} r={36} fill={L.skin} />}
          {headwear(true)}
          {face()}
        </g>
        {arm(armF, -1)}
      </g>
    </g>
  );
}
