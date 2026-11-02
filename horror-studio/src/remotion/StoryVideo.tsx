// الفيديو الكامل: شاشة العنوان ثم المشاهد بالتتابع، مع صوت الراوي والمؤثرات وصوت الخلفية.
import React, { useEffect, useState } from "react";
import { AbsoluteFill, Audio, Sequence, continueRender, delayRender, interpolate, staticFile, useCurrentFrame } from "remotion";
import { FPS, Project, SfxId } from "../shared/types";
import { TITLE_SECONDS, sceneFrames } from "../shared/timing";
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

export function StoryVideo({ project, absoluteMedia = "" }: { project: Project; absoluteMedia?: string }) {
  useFonts();
  const media = (u: string) => (u.startsWith("/") ? absoluteMedia + u : u);
  let from = Math.round(TITLE_SECONDS * FPS);
  const total = from + project.scenes.reduce((n, s) => n + sceneFrames(s), 0);
  return (
    <AbsoluteFill style={{ background: "#000" }}>
      <Sequence durationInFrames={from}><Title title={project.title} /></Sequence>
      {project.ambience && <Audio src={sfxUrl(project.ambience)} loop volume={project.ambienceVolume} />}
      {project.scenes.map((s) => {
        const d = sceneFrames(s);
        const start = from;
        from += d;
        return (
          <Sequence key={s.id} from={start} durationInFrames={d}>
            <SceneView scene={s} />
            {s.narration && <Audio src={media(s.narration.url)} />}
            {s.sfx.filter((x) => x !== project.ambience).map((x) => (
              <Audio key={x} src={sfxUrl(x)} volume={VOLUME[x]} loop={LOOPING.includes(x)} />
            ))}
          </Sequence>
        );
      })}
      {total > 0 && null}
    </AbsoluteFill>
  );
}
