import React from "react";
import { Composition } from "remotion";
import { FPS, HEIGHT, Project, WIDTH } from "../shared/types";
import { totalFrames } from "../shared/timing";
import { StoryVideo } from "./StoryVideo";

const empty: Project = { title: "", story: "", scenes: [], ambience: null, ambienceVolume: 0 };

export const Root: React.FC = () => (
  <Composition
    id="Story"
    component={StoryVideo}
    width={WIDTH}
    height={HEIGHT}
    fps={FPS}
    durationInFrames={90}
    defaultProps={{ project: empty, absoluteMedia: "" }}
    calculateMetadata={({ props }) => ({ durationInFrames: Math.max(30, totalFrames(props.project)) })}
  />
);
