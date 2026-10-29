/**
 * Home icon (Lucide), committed as a maintainer artefact per the
 * generator's icon convention: generated once with
 * `npx @tamagui/cli icons add Home ...` and the `themed()` wrapper
 * removed, so the generator never runs the icon generator or installs any
 * `@tamagui/*` package at generation time.
 */
import * as React from 'react';
import Svg, { Path } from 'react-native-svg';

export interface HomeIconProps {
  size?: number | string;
  color?: string;
}

function Home({ size = 24, color = 'currentColor' }: HomeIconProps) {
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
      <Path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8" />
      <Path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </Svg>
  );
}

export default React.memo(Home);
