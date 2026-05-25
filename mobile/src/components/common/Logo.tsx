import React from 'react';
import { Image, ImageStyle, StyleProp } from 'react-native';

interface Props {
  size?: number;
  width?: number;
  height?: number;
  style?: StyleProp<ImageStyle>;
}

export default function Logo({ size = 40, width, height, style }: Props) {
  return (
    <Image
      source={require('../../../assets/logo.png')}
      style={[{ width: width ?? size * 2.8, height: height ?? size, resizeMode: 'contain' }, style]}
    />
  );
}
