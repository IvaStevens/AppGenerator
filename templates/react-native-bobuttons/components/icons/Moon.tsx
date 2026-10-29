/**
 * Moon icon (Lucide), committed as a maintainer artefact per the
 * generator's icon convention: generated once with
 * `npx @tamagui/cli icons add Moon ...` and the `themed()` wrapper
 * removed, so the generator never runs the icon generator or installs any
 * `@tamagui/*` package at generation time.
 */
import * as React from 'react';
import Svg, { Path } from 'react-native-svg';

export interface MoonIconProps {
  size?: number | string;
  color?: string;
}

function Moon({ size = 24, color = 'currentColor' }: MoonIconProps) {
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
      <Path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </Svg>
  );
}

export default React.memo(Moon);
