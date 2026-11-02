// خلفيات مسطحة بسيطة جدًا: أشكال هندسية وألوان صريحة، بلا تدرجات ولا ظلال معقدة.
import React from "react";
import { BackgroundId, GROUND_Y } from "../shared/types";

export const C = {
  sky: "#1c2240", skyDeep: "#141933", star: "#f4efd9", moon: "#efe4c3",
  dune1: "#5d4a3c", dune2: "#4a3a2f", sand: "#6b5543", road: "#2a2a2f", roadLine: "#d6c07a",
  mud: "#8a6b4e", mudDark: "#6c5340", mudDoor: "#3b2a20", winLit: "#f2c94c", winDark: "#2a2230",
  mosque: "#e6dccb", mosqueDark: "#cbbfa8", arch: "#33424f", crescent: "#f2c94c",
  wall: "#2c3147", wallDark: "#232739", floor: "#3a3346", bed: "#5a4636", blanket: "#6e2c33", pillow: "#d9d2c3",
  wood: "#6b4a33", woodDark: "#523825", frame: "#1b1e2b", curtain: "#5a2a35",
};

const W0 = -260, W1 = 1340; // العالم أعرض من الإطار لتحريك الكاميرا

function Stars({ n = 40, seed = 1, maxY = 900 }: { n?: number; seed?: number; maxY?: number }) {
  const stars = [];
  let s = seed * 9301;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  for (let i = 0; i < n; i++) stars.push(<circle key={i} cx={W0 + rnd() * (W1 - W0)} cy={rnd() * maxY} r={2 + rnd() * 3} fill={C.star} />);
  return <g>{stars}</g>;
}

const Sky = ({ moonX = 820, moonY = 330 }) => (
  <g>
    <rect x={W0} y={-200} width={W1 - W0} height={2400} fill={C.sky} />
    <rect x={W0} y={-200} width={W1 - W0} height={500} fill={C.skyDeep} />
    <Stars />
    <circle cx={moonX} cy={moonY} r={90} fill={C.moon} />
    <circle cx={moonX + 34} cy={moonY - 18} r={78} fill={C.sky} />
  </g>
);

// بيت طيني نجدي بسيط: مستطيل + شرفات مثلثة + باب + نوافذ مربعة
export function House({ x, y, w, h, lit, door = true }: { x: number; y: number; w: number; h: number; lit: boolean; door?: boolean }) {
  const teeth = [];
  for (let i = 0; i < Math.floor(w / 36); i++) teeth.push(<polygon key={i} points={`${x + 6 + i * 36},${y - h} ${x + 24 + i * 36},${y - h - 22} ${x + 42 + i * 36},${y - h}`} fill={C.mud} />);
  return (
    <g>
      {teeth}
      <rect x={x} y={y - h} width={w} height={h} fill={C.mud} />
      <rect x={x + w - 18} y={y - h} width={18} height={h} fill={C.mudDark} />
      {door && <rect x={x + w / 2 - 22} y={y - 90} width={44} height={90} fill={C.mudDoor} rx={4} />}
      <rect x={x + 18} y={y - h + 30} width={30} height={30} fill={lit ? C.winLit : C.winDark} />
      {w > 150 && <rect x={x + w - 62} y={y - h + 30} width={30} height={30} fill={lit ? C.winLit : C.winDark} />}
    </g>
  );
}

// مسجد صغير جدًا: جسم مستطيل + قبة نصف دائرة + مئذنة صغيرة
export function Mosque({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <rect x={140} y={-360} width={46} height={360} fill={C.mosque} />
      <rect x={134} y={-250} width={58} height={14} fill={C.mosqueDark} />
      <polygon points="134,-360 163,-420 192,-360" fill={C.mosqueDark} />
      <circle cx={163} cy={-432} r={8} fill={C.crescent} />
      <rect x={-150} y={-200} width={290} height={200} fill={C.mosque} />
      <path d="M -80 -200 A 75 75 0 0 1 70 -200 Z" fill={C.mosqueDark} />
      <rect x={-8} y={-292} width={6} height={20} fill={C.crescent} />
      <path d="M -32 0 L -32 -80 A 27 27 0 0 1 22 -80 L 22 0 Z" fill={C.arch} />
      <path d="M -125 -110 L -125 -140 A 15 15 0 0 1 -95 -140 L -95 -110 Z" fill={C.arch} />
      <path d="M 85 -110 L 85 -140 A 15 15 0 0 1 115 -140 L 115 -110 Z" fill={C.arch} />
    </g>
  );
}

const Ground = ({ y = GROUND_Y, color = C.sand }) => <rect x={W0} y={y} width={W1 - W0} height={2000} fill={color} />;

function DesertRoad({ lit }: { lit: boolean }) {
  return (
    <g>
      <Sky />
      {lit && (
        <g>
          <rect x={60} y={1060} width={70} height={40} fill={C.mudDark} /><rect x={78} y={1070} width={14} height={14} fill={C.winLit} />
          <rect x={140} y={1045} width={90} height={55} fill={C.mudDark} /><rect x={160} y={1058} width={14} height={14} fill={C.winLit} /><rect x={196} y={1058} width={14} height={14} fill={C.winLit} />
          <rect x={250} y={1000} width={14} height={100} fill={C.mosqueDark} />
        </g>
      )}
      <path d={`M ${W0} 1120 Q 200 1020 520 1110 T 1340 1080 L 1340 1400 L ${W0} 1400 Z`} fill={C.dune2} />
      <path d={`M ${W0} 1220 Q 350 1150 700 1230 T 1340 1200 L 1340 1500 L ${W0} 1500 Z`} fill={C.dune1} />
      <Ground y={GROUND_Y - 60} />
      <rect x={W0} y={GROUND_Y - 30} width={W1 - W0} height={150} fill={C.road} />
      {Array.from({ length: 14 }, (_, i) => <rect key={i} x={W0 + i * 120} y={GROUND_Y + 40} width={60} height={8} fill={C.roadLine} />)}
    </g>
  );
}

function Village({ lit, mosque }: { lit: boolean; mosque: boolean }) {
  return (
    <g>
      <Sky moonX={250} moonY={360} />
      <House x={-220} y={GROUND_Y - 120} w={200} h={170} lit={lit} door={false} />
      <House x={820} y={GROUND_Y - 110} w={260} h={200} lit={lit} door={false} />
      <House x={1100} y={GROUND_Y - 100} w={200} h={150} lit={lit} door={false} />
      <Ground y={GROUND_Y - 100} color={C.dune1} />
      {mosque ? <Mosque x={420} y={GROUND_Y - 40} s={1.15} /> : <House x={330} y={GROUND_Y - 40} w={260} h={230} lit={lit} />}
      <House x={-60} y={GROUND_Y - 30} w={230} h={210} lit={lit} />
      {!mosque && <House x={640} y={GROUND_Y - 30} w={220} h={190} lit={lit} />}
      <Ground y={GROUND_Y - 30} />
    </g>
  );
}

function Bedroom({ lampOn }: { lampOn: boolean }) {
  return (
    <g>
      <rect x={W0} y={-200} width={W1 - W0} height={2400} fill={C.wall} />
      <rect x={W0} y={GROUND_Y - 40} width={W1 - W0} height={1000} fill={C.floor} />
      <rect x={W0} y={GROUND_Y - 52} width={W1 - W0} height={14} fill={C.wallDark} />
      {/* النافذة */}
      <rect x={640} y={700} width={240} height={330} fill={C.frame} />
      <rect x={656} y={716} width={208} height={298} fill={C.skyDeep} />
      <circle cx={820} cy={780} r={26} fill={C.moon} />
      <rect x={756} y={716} width={8} height={298} fill={C.frame} />
      <rect x={656} y={860} width={208} height={8} fill={C.frame} />
      {/* السرير */}
      <rect x={-120} y={GROUND_Y - 190} width={420} height={110} fill={C.blanket} rx={10} />
      <rect x={-130} y={GROUND_Y - 260} width={30} height={230} fill={C.bed} />
      <rect x={-90} y={GROUND_Y - 230} width={120} height={50} fill={C.pillow} rx={20} />
      <rect x={-130} y={GROUND_Y - 90} width={450} height={30} fill={C.bed} />
      <rect x={290} y={GROUND_Y - 150} width={30} height={120} fill={C.bed} />
      {/* طاولة صغيرة */}
      <rect x={720} y={GROUND_Y - 170} width={170} height={20} fill={C.wood} />
      <rect x={740} y={GROUND_Y - 150} width={18} height={110} fill={C.woodDark} />
      <rect x={852} y={GROUND_Y - 150} width={18} height={110} fill={C.woodDark} />
      {lampOn && <rect x={W0} y={-200} width={W1 - W0} height={2400} fill="#f2c94c" opacity={0.04} />}
    </g>
  );
}

function Door({ open }: { open: number }) {
  // open: 0 مغلق .. 1 مفتوح (الباب يدور حول مفصله بتصغير عرضه)
  const w = 360, h = 640, x = 360, y = GROUND_Y - 40 - h;
  return (
    <g>
      <rect x={W0} y={-200} width={W1 - W0} height={2400} fill={C.wall} />
      <rect x={W0} y={GROUND_Y - 40} width={W1 - W0} height={1000} fill={C.floor} />
      <rect x={x - 26} y={y - 26} width={w + 52} height={h + 26} fill={C.woodDark} />
      <rect x={x} y={y} width={w} height={h} fill="#05060a" />
      {open > 0.05 && <rect x={x} y={y} width={w} height={h} fill={C.skyDeep} opacity={0.9} />}
      <g transform={`translate(${x} 0) scale(${1 - 0.85 * open} 1) translate(${-x} 0)`}>
        <rect x={x} y={y} width={w} height={h} fill={C.wood} />
        {[1, 2, 3].map((i) => <rect key={i} x={x + (w / 4) * i - 3} y={y} width={6} height={h} fill={C.woodDark} />)}
        <rect x={x} y={y + 120} width={w} height={16} fill={C.woodDark} />
        <rect x={x} y={y + h - 140} width={w} height={16} fill={C.woodDark} />
        <circle cx={x + w - 46} cy={y + h / 2} r={14} fill={C.crescent} />
      </g>
      {open < 0.05 && <rect x={x} y={GROUND_Y - 46} width={w} height={6} fill={C.winLit} />}
    </g>
  );
}

// من داخل الغرفة: فتحة نافذة كبيرة يُرى منها الخارج
export const WINDOW_OPENING = { x: 140, y: 520, w: 800, h: 760 };
function WindowOutside({ lit }: { lit: boolean }) {
  const o = WINDOW_OPENING;
  return (
    <g>
      <rect x={o.x} y={o.y} width={o.w} height={o.h} fill={C.sky} />
      <Stars n={14} seed={3} maxY={o.y + 300} />
      <circle cx={o.x + 620} cy={o.y + 120} r={46} fill={C.moon} />
      <House x={o.x + 20} y={o.y + 600} w={200} h={170} lit={lit} />
      <House x={o.x + 520} y={o.y + 600} w={240} h={190} lit={lit} />
      <rect x={o.x} y={o.y + 600} width={o.w} height={200} fill={C.dune1} />
    </g>
  );
}
function WindowFrame() {
  const o = WINDOW_OPENING;
  return (
    <g>
      <path d={`M ${W0} -200 H ${W1} V 2200 H ${W0} Z M ${o.x} ${o.y} V ${o.y + o.h} H ${o.x + o.w} V ${o.y} Z`} fill={C.wall} fillRule="evenodd" />
      <rect x={o.x - 20} y={o.y - 20} width={o.w + 40} height={20} fill={C.frame} />
      <rect x={o.x - 20} y={o.y + o.h} width={o.w + 40} height={30} fill={C.frame} />
      <rect x={o.x - 20} y={o.y} width={20} height={o.h} fill={C.frame} />
      <rect x={o.x + o.w} y={o.y} width={20} height={o.h} fill={C.frame} />
      <rect x={o.x + o.w / 2 - 8} y={o.y} width={16} height={o.h} fill={C.frame} />
      <rect x={o.x} y={o.y + o.h / 2 - 8} width={o.w} height={16} fill={C.frame} />
      <path d={`M ${o.x - 60} ${o.y - 40} H ${o.x + 120} Q ${o.x + 60} ${o.y + 400} ${o.x + 40} ${o.y + o.h + 60} H ${o.x - 60} Z`} fill={C.curtain} />
      <path d={`M ${o.x + o.w + 60} ${o.y - 40} H ${o.x + o.w - 120} Q ${o.x + o.w - 60} ${o.y + 400} ${o.x + o.w - 40} ${o.y + o.h + 60} H ${o.x + o.w + 60} Z`} fill={C.curtain} />
      <rect x={W0} y={GROUND_Y + 100} width={W1 - W0} height={900} fill={C.floor} />
    </g>
  );
}

function NightSky() {
  return (
    <g>
      <Sky moonX={540} moonY={600} />
      <Ground y={GROUND_Y} color={C.dune2} />
    </g>
  );
}

export type BgLayers = { back: React.ReactNode; front?: React.ReactNode; clip?: { x: number; y: number; w: number; h: number }; groundY: number };

export function background(id: BackgroundId, opts: { lit: boolean; lampOn: boolean; doorOpen: number }): BgLayers {
  switch (id) {
    case "desertRoad": return { back: <DesertRoad lit={opts.lit} />, groundY: GROUND_Y };
    case "village": return { back: <Village lit={opts.lit} mosque={false} />, groundY: GROUND_Y };
    case "mosque": return { back: <Village lit={opts.lit} mosque />, groundY: GROUND_Y };
    case "bedroom": return { back: <Bedroom lampOn={opts.lampOn} />, groundY: GROUND_Y };
    case "door": return { back: <Door open={opts.doorOpen} />, groundY: GROUND_Y };
    case "windowView": return { back: <WindowOutside lit={opts.lit} />, front: <WindowFrame />, clip: WINDOW_OPENING, groundY: WINDOW_OPENING.y + 650 };
    case "nightSky": return { back: <NightSky />, groundY: GROUND_Y };
  }
}
