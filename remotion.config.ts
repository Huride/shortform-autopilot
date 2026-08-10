import { Config } from '@remotion/cli/config';

Config.setVideoImageFormat('jpeg');
Config.setOverwriteOutput(true);
// 유튜브·인스타 모두 H.264/AAC MP4 를 요구한다.
Config.setCodec('h264');
