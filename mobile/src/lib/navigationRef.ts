import { createNavigationContainerRef } from '@react-navigation/native';
import { RootStackParamList } from '../navigation/types';

// Module-level nav ref so code outside any screen component (push
// notification tap handling, which fires before a screen even mounts on a
// cold start) can still navigate once the container is ready.
export const navigationRef = createNavigationContainerRef<RootStackParamList>();
