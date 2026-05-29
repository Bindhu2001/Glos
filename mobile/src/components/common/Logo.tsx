import React from 'react';
import { Image, StyleProp, View, ViewStyle } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';

const lightLogo = require('../../../assets/logo.png');
const darkLogo = require('../../../assets/logo-dark.png');

interface Props {
  size?: number;
  width?: number;
  height?: number;
  style?: StyleProp<ViewStyle>;
}

export default function Logo({ size = 40, width, height, style }: Props) {
  const { isDark } = useTheme();
  const w = width ?? size * 2.44;
  const h = height ?? size;
  return (
    <View style={[{ width: w, height: h }, style]}>
      <Image
        source={lightLogo}
        style={{ width: w, height: h, opacity: isDark ? 0 : 1, position: 'absolute' }}
        resizeMode="contain"
      />
      <Image
        source={darkLogo}
        style={{ width: w, height: h, opacity: isDark ? 1 : 0, position: 'absolute' }}
        resizeMode="contain"
      />
    </View>
  );
}
