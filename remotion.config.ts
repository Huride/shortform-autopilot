import { Config } from '@remotion/cli/config';

Config.setVideoImageFormat('jpeg');
Config.setOverwriteOutput(true);
// 유튜브·인스타 모두 H.264/AAC MP4 를 요구한다.
Config.setCodec('h264');
// CLI 도 파이프라인과 같은 public 디렉터리를 본다 (render.ts 의 publicDir 과 일치)
Config.setPublicDir('./remotion/public');
