// The single thin UI seam. Every file outside this one must import UI
// primitives from here ("src/ui") rather than directly from @gluestack-ui/*
// or react-native*. gluestack-ui is an explicitly temporary stand-in for a
// future in-house component library (and, later, a React Native target) -
// this seam is what makes swapping either one a one-file change instead of
// a repo-wide refactor.

import React from "react";
import { GluestackUIProvider } from "@gluestack-ui/themed";
import { config } from "@gluestack-ui/config";

export { Box, Text, Button, ButtonText, Heading } from "@gluestack-ui/themed";

export function UIProvider({ children }) {
  return <GluestackUIProvider config={config}>{children}</GluestackUIProvider>;
}
