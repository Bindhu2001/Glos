import React from 'react';
import { Image, ImageStyle, StyleProp } from 'react-native';

interface Props {
  size?: number;
  style?: StyleProp<ImageStyle>;
}

export default function Logo({ size = 48, style }: Props) {
  return (
    <Image
      source={require('../../../assets/logo.png')}
      style={[{ width: size, height: size, resizeMode: 'contain' }, style]}
    />
  );
}
