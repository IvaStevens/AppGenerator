/**
 * Sun icon (Lucide), committed as a maintainer artefact per the
 * generator's icon convention: generated once with
 * `npx @tamagui/cli icons add Sun ...` and the `themed()` wrapper
 * removed, so the generator never runs the icon generator or installs any
 * `@tamagui/*` package at generation time.
 */
import * as React from 'react';
import Svg, { Circle, Line } from 'react-native-svg';

export interface SunIconProps {
  size?: number | string;
  color?: string;
}

function Sun({ size = 24, color = 'currentColor' }: SunIconProps) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <Circle cx={12} cy={12} r={4} />
      <Line x1={12} y1={2} x2={12} y2={4} />
      <Line x1={12} y1={20} x2={12} y2={22} />
      <Line x1={4.93} y1={4.93} x2={6.34} y2={6.34} />
      <Line x1={17.66} y1={17.66} x2={19.07} y2={19.07} />
      <Line x1={2} y1={12} x2={4} y2={12} />
      <Line x1={20} y1={12} x2={22} y2={12} />
      <Line x1={4.93} y1={19.07} x2={6.34} y2={17.66} />
      <Line x1={17.66} y1={6.34} x2={19.07} y2={4.93} />
    </Svg>
  );
}

export default React.memo(Sun);
