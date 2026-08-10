import React from 'react';
import { Composition } from 'remotion';
import { InfoShort } from './InfoShort';
import { WeeklyRecap } from './WeeklyRecap';
import {
  COMPOSITION_ID,
  OUTRO_FRAMES,
  WEEKLY_COMPOSITION_ID,
  defaultShortProps,
  defaultWeeklyProps,
  weeklyDurationInFrames,
} from './schema';

const FPS = 30;

export const RemotionRoot: React.FC = () => (
  <>
    <Composition
      id={COMPOSITION_ID}
      component={InfoShort}
      fps={FPS}
      width={1080}
      height={1920}
      defaultProps={defaultShortProps}
      // 길이는 장면들의 합으로 결정된다 — 대본이 길어지면 영상도 길어진다.
      // 브랜드가 있으면 로고 아웃트로만큼 더한다.
      calculateMetadata={({ props }) => ({
        durationInFrames: Math.max(
          props.scenes.reduce((sum, s) => sum + s.durationInFrames, 0) +
            (props.brand ? OUTRO_FRAMES : 0),
          1,
        ),
      })}
    />
    {/* 주간 결산 롱폼 — 가로 1080p. 일요일 유튜브 전용. */}
    <Composition
      id={WEEKLY_COMPOSITION_ID}
      component={WeeklyRecap}
      fps={FPS}
      width={1920}
      height={1080}
      defaultProps={defaultWeeklyProps}
      calculateMetadata={({ props }) => ({
        durationInFrames: weeklyDurationInFrames(props),
      })}
    />
  </>
);
