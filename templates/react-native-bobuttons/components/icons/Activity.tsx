/**
 * Activity icon (Lucide), committed as a maintainer artefact per the
 * generator's icon convention: generated once with
 * `npx @tamagui/cli icons add Activity ...` and the `themed()` wrapper
 * removed, so the generator never runs the icon generator or installs any
 * `@tamagui/*` package at generation time.
 */
import * as React from 'react';
import Svg, { Path } from 'react-native-svg';

export interface ActivityIconProps {
  size?: number | string;
  color?: string;
}

function Activity({ size = 24, color = 'currentColor' }: ActivityIconProps) {
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
      <Path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2" />
    </Svg>
  );
}

export default React.memo(Activity);
