// الفيديو الكامل: شاشة العنوان ثم المشاهد بالتتابع، مع صوت الراوي والمؤثرات وصوت الخلفية.
import React, { useEffect, useState } from "react";
import { AbsoluteFill, Audio, Freeze, Sequence, continueRender, delayRender, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { FPS, Project, SfxId } from "../shared/types";
import { CHOICE_SECONDS, TITLE_SECONDS, hasChoices, sceneFrames } from "../shared/timing";
import { SceneView } from "./SceneView";

const LOOPING: SfxId[] = ["wind", "drone", "crickets", "heartbeat"];
const VOLUME: Record<SfxId, number> = {
  wind: 0.35, drone: 0.5, heartbeat: 0.7, knock: 0.9, creak: 0.8, ring: 0.6, engine: 0.8, sting: 0.7, whisper: 0.5, footsteps: 0.5, crickets: 0.3,
};

const sfxUrl = (id: SfxId) => staticFile(`sfx/${id}.wav`);

// خط عربي محلي ينتظره العرض قبل التصوير
function useFonts() {
  const [handle] = useState(() => delayRender("fonts"));
  useEffect(() => {
    const faces = [new FontFace("Kufi", `url(${staticFile("fonts/kufi.woff2")})`, { weight: "100 900" })];
    Promise.all(faces.map((f) => f.load().then((ff) => document.fonts.add(ff)))).finally(() => continueRender(handle));
  }, [handle]);
}

function Title({ title }: { title: string }) {
  const f = useCurrentFrame();
  const o = interpolate(f, [0, 12, TITLE_SECONDS * FPS - 10, TITLE_SECONDS * FPS], [0, 1, 1, 0]);
  const flick = f % 23 === 7 || f % 31 === 3 ? 0.4 : 1;
  return (
    <AbsoluteFill style={{ background: "#07080d", alignItems: "center", justifyContent: "center" }}>
      <div style={{ opacity: o * flick, color: "#e9e1cc", fontFamily: "Kufi, sans-serif", fontWeight: 800, fontSize: 92, lineHeight: 1.5, textAlign: "center", direction: "rtl", padding: 80 }}>
        {title}
      </div>
    </AbsoluteFill>
  );
}

// الخياران في النهاية: مستطيلان بحواف مدورة، الأول بنفسجي غامق
function Choices({ choices }: { choices: string[] }) {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const dim = interpolate(f, [0, 12], [0, 0.55], { extrapolateRight: "clamp" });
  const box = (text: string, i: number) => {
    const s = spring({ frame: f - 10 - i * 8, fps, config: { damping: 12, stiffness: 140 } });
    const first = i === 0;
    const glow = first ? 0.5 + 0.5 * Math.sin(f / 8) : 0;
    return (
      <div key={i} style={{
        transform: `scale(${0.6 + 0.4 * s})`, opacity: s,
        width: 760, padding: "34px 40px", borderRadius: 34, textAlign: "center",
        background: first ? "#3b1a5e" : "#1b1d27",
        border: first ? "4px solid #7b4cb0" : "4px solid #4b4f63",
        boxShadow: first ? `0 0 ${30 + glow * 30}px rgba(123,76,176,${0.35 + glow * 0.3})` : "0 10px 30px rgba(0,0,0,.4)",
        color: "#fff", fontFamily: "Kufi, sans-serif", fontWeight: 800, fontSize: 70, lineHeight: 1.4,
      }}>{text}</div>
    );
  };
  return (
    <AbsoluteFill style={{ background: `rgba(0,0,0,${dim})`, alignItems: "center", justifyContent: "center", gap: 46, direction: "rtl" }}>
      {choices.map(box)}
    </AbsoluteFill>
  );
}

export function StoryVideo({ project, absoluteMedia = "" }: { project: Project; absoluteMedia?: string }) {
  useFonts();
  const media = (u: string) => (u.startsWith("/") ? absoluteMedia + u : u);
  let from = Math.round(TITLE_SECONDS * FPS);
  const total = from + project.scenes.reduce((n, s) => n + sceneFrames(s), 0);
  return (
    <AbsoluteFill style={{ background: "#000" }}>
      <Sequence durationInFrames={from}><Title title={project.title} /></Sequence>
      {!project.silent && project.ambience && <Audio src={sfxUrl(project.ambience)} loop volume={project.ambienceVolume} />}
      {project.scenes.map((s) => {
        const d = sceneFrames(s);
        const start = from;
        from += d;
        return (
          <Sequence key={s.id} from={start} durationInFrames={d}>
            <SceneView scene={s} />
            {!project.silent && s.narration && <Audio src={media(s.narration.url)} />}
            {!project.silent && s.sfx.filter((x) => x !== project.ambience).map((x) => (
              <Audio key={x} src={sfxUrl(x)} volume={VOLUME[x]} loop={LOOPING.includes(x)} />
            ))}
          </Sequence>
        );
      })}
      {hasChoices(project) && (
        <Sequence from={total} durationInFrames={Math.round(CHOICE_SECONDS * FPS)}>
          <Freeze frame={sceneFrames(project.scenes[project.scenes.length - 1]) - 1}>
            <SceneView scene={project.scenes[project.scenes.length - 1]} hideText />
          </Freeze>
          <Choices choices={project.choices} />
        </Sequence>
      )}
    </AbsoluteFill>
  );
}
