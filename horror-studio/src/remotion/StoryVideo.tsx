// الفيديو الكامل: شاشة العنوان ثم المشاهد بالتتابع، مع صوت الراوي والمؤثرات وصوت الخلفية.
import React, { useEffect, useState } from "react";
import { AbsoluteFill, Audio, Freeze, Sequence, continueRender, delayRender, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { FPS, Project, SfxId } from "../shared/types";
import { TITLE_SECONDS, choiceFrames, hasChoices, sceneFrames } from "../shared/timing";
import { SceneView } from "./SceneView";

const LOOPING: SfxId[] = ["wind", "drone", "crickets", "heartbeat", "car", "tick"];
const VOLUME: Record<SfxId, number> = {
  wind: 0.35, drone: 0.5, car: 0.55, tick: 0.6, heartbeat: 0.7, knock: 0.9, creak: 0.8, ring: 0.6, engine: 0.8, sting: 0.7, whisper: 0.5, footsteps: 0.5, crickets: 0.3,
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
function Choices({ choices, prompt }: { choices: string[]; prompt?: string }) {
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
      {prompt && (
        <div style={{ opacity: interpolate(f, [10, 22], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }), color: "#fff",
          fontFamily: "Kufi, sans-serif", fontWeight: 800, fontSize: 60, lineHeight: 1.6, textAlign: "center", padding: "0 70px", marginBottom: 20,
          textShadow: "3px 3px 0 #000" }}>{prompt}</div>
      )}
      {choices.map(box)}
    </AbsoluteFill>
  );
}

export function StoryVideo({ project, absoluteMedia = "" }: { project: Project; absoluteMedia?: string }) {
  useFonts();
  const media = (u: string) => (u.startsWith("/") ? absoluteMedia + u : u);
  // مع تسجيل الراوي تنخفض المؤثرات حتى يبقى الكلام واضحًا
  const duck = !project.narrationOff && project.voiceTrack ? 0.45 : 1;
  let from = Math.round(TITLE_SECONDS * FPS);
  const total = from + project.scenes.reduce((n, s) => n + sceneFrames(s), 0);
  return (
    <AbsoluteFill style={{ background: "#000" }}>
      <Sequence durationInFrames={from}><Title title={project.title} /></Sequence>
      {!project.narrationOff && project.voiceTrack && (
        <Sequence from={from}><Audio src={media(project.voiceTrack.url)} /></Sequence>
      )}
      {project.ambience && <Audio src={sfxUrl(project.ambience)} loop volume={project.ambienceVolume * duck} />}
      {project.scenes.map((s) => {
        const d = sceneFrames(s);
        const start = from;
        from += d;
        return (
          <Sequence key={s.id} from={start} durationInFrames={d}>
            <SceneView scene={s} />
            {!project.narrationOff && s.narration && <Audio src={media(s.narration.url)} />}
            {s.sfx.filter((x) => x !== project.ambience).map((x) => (
              <Audio key={x} src={sfxUrl(x)} volume={VOLUME[x] * duck} loop={LOOPING.includes(x)} />
            ))}
          </Sequence>
        );
      })}
      {hasChoices(project) && (
        <Sequence from={total} durationInFrames={choiceFrames(project)}>
          <Freeze frame={sceneFrames(project.scenes[project.scenes.length - 1]) - 1}>
            <SceneView scene={project.scenes[project.scenes.length - 1]} hideText />
          </Freeze>
          <Choices choices={project.choices} prompt={project.choicesPrompt} />
          <Audio src={sfxUrl("heartbeat")} volume={0.8 * duck} loop />
        </Sequence>
      )}
    </AbsoluteFill>
  );
}
