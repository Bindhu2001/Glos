import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

const ICON_IMG = require('../../../assets/splash/ring_icon.png');
const G_IMG = require('../../../assets/splash/letter_G.png');
const L_IMG = require('../../../assets/splash/letter_L.png');
const S_IMG = require('../../../assets/splash/letter_S.png');
const TAG_TEXT_IMG = require('../../../assets/splash/tag_text_white.png');
const LINE_L_IMG = require('../../../assets/splash/tag_line_left.png');
const LINE_R_IMG = require('../../../assets/splash/tag_line_right.png');

const BG = '#000';
const MUTED = '#566072';
const INK_SOFT = '#8C97AC';

// Ported 1:1 from glos-mob/index.html (the reference splash animation built
// against these same PNG assets) — percentages of the square stage, exactly
// as authored there, so this stays a faithful port rather than a re-guess.
const LAYOUT = {
  icon: { cx: 56.462, cy: 47.988, w: 18.856, h: 18.856 },
  G: { cx: 19.348, cy: 47.988, w: 18.198, h: 18.796 },
  L: { cx: 38.443, cy: 47.868, w: 14.486, h: 18.557 },
  S: { cx: 79.808, cy: 47.868, w: 17.719, h: 18.557 },
  text: { cx: 49.398, cy: 63.133, w: 33.522, h: 3.592 },
  lineL: { cx: 20.904, cy: 63.552, w: 14.846, h: 0.599 },
  lineR: { cx: 79.269, cy: 63.552, w: 18.557, h: 0.599 },
};
const CENTER = 50;
const BIG_ICON_W = 42.593;
const TEXT_BIG_W = LAYOUT.text.w * 2.3;

// Timeline (ms) — same beats as the reference's T object (there in seconds).
const T = {
  A0: 0, A1: 830, // icon fades + scales in, big, centered
  B1: 1270, // hold big icon
  C0: 1270, C1: 2670, // G, L, O(icon), S move together into GLOS formation
  T0: 3000, T1: 4000, // tagline: text moves like the icon; side lines slide in
  F1: 4400, // hold full logo
  G1: 4730, // fade to black complete
};

function easeOutCubic(t: number) {
  'worklet';
  t = Math.min(Math.max(t, 0), 1);
  return 1 - Math.pow(1 - t, 3);
}
function lerp(a: number, b: number, t: number) {
  'worklet';
  return a + (b - a) * t;
}
// Mirrors the reference's place(): cx/cy/w/h are percentages of the square
// stage; left/top are converted from the CSS translate(-50%,-50%) centering
// trick into plain pixel offsets since RN doesn't support percentage
// transforms.
function place(cx: number, cy: number, w: number, h: number, opacity: number, stage: number) {
  'worklet';
  const width = (w / 100) * stage;
  const height = (h / 100) * stage;
  return {
    left: (cx / 100) * stage - width / 2,
    top: (cy / 100) * stage - height / 2,
    width,
    height,
    opacity,
  };
}

// fn() returns a Promise (Haptics.impactAsync/notificationAsync are async) —
// a plain try/catch around the call only ever catches a *synchronous* throw,
// never a rejected promise, so a real native-side failure here was silently
// becoming an unhandled rejection instead of being caught by this "non-fatal,
// just skip it" guard. .catch() on the returned promise actually catches it.
function hapticTap(fn: () => Promise<unknown>) {
  try {
    fn()?.catch(() => {
      // haptics unsupported/unavailable on this device — non-fatal, skip the tap
    });
  } catch {
    // haptics unsupported on this device — non-fatal, just skip the tap
  }
}

export default function LaunchScreen({ onDone }: { onDone?: () => void }) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  // Matches the reference's `width: min(92vw, 92vh); aspect-ratio: 1/1`.
  const stage = Math.min(width, height) * 0.92;

  // Single clock driving every element's placement, exactly like the
  // reference's one `elapsed` value feeding its render(t) function — a
  // linear withTiming from 0 to T.G1 over T.G1ms makes progress.value equal
  // elapsed milliseconds at every frame, so it doubles as a synchronous stand-in for
  // requestAnimationFrame's `time`.
  const progress = useSharedValue(0);

  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    progress.value = withTiming(T.G1, { duration: T.G1, easing: Easing.linear });

    const at = (ms: number, fn: () => void) => {
      timers.current.push(setTimeout(fn, ms));
    };

    // 20 hard, evenly-spaced beats across a 2s window (100ms apart),
    // alternating Heavy/Rigid so it reads as a strong, insistent pulse
    // rather than 20 identical clicks. Independent of the (longer, ~4.7s)
    // visual timeline above.
    const H_TOTAL = 2000;
    const BEAT_COUNT = 20;
    for (let i = 0; i < BEAT_COUNT; i++) {
      const style = i % 2 === 0 ? Haptics.ImpactFeedbackStyle.Heavy : Haptics.ImpactFeedbackStyle.Rigid;
      at((H_TOTAL / BEAT_COUNT) * i, () => hapticTap(() => Haptics.impactAsync(style)));
    }

    // The two moments that actually need to land HARD, synced to the real
    // (uncompressed) visual timeline instead of the ambient 2s pulse above:
    // a rapid-fire Rigid/Heavy slam right as GLOS locks into formation, and
    // again right as "Perform Better" finishes aligning.
    const slam = (delayMs: number) => {
      const seq = [
        Haptics.ImpactFeedbackStyle.Rigid, Haptics.ImpactFeedbackStyle.Heavy,
        Haptics.ImpactFeedbackStyle.Rigid, Haptics.ImpactFeedbackStyle.Heavy,
        Haptics.ImpactFeedbackStyle.Rigid, Haptics.ImpactFeedbackStyle.Heavy,
      ];
      seq.forEach((style, i) => at(delayMs + i * 22, () => hapticTap(() => Haptics.impactAsync(style))));
    };

    // GLOS letters lock into formation
    at(T.C1, () => slam(0));

    // "Perform Better" fully aligned — slam, then the success buzz right after
    at(T.T1, () => {
      slam(0);
      at(160, () => hapticTap(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)));
    });

    at(T.G1 + 200, () => onDone?.());

    return () => {
      timers.current.forEach(clearTimeout);
      timers.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const iconStyle = useAnimatedStyle(() => {
    const t = progress.value;
    if (t < T.A1) {
      const te = easeOutCubic((t - T.A0) / (T.A1 - T.A0));
      const w = lerp(0, BIG_ICON_W, te);
      return place(CENTER, CENTER, w, w, te, stage);
    }
    if (t < T.B1) {
      return place(CENTER, CENTER, BIG_ICON_W, BIG_ICON_W, 1, stage);
    }
    if (t < T.C1) {
      const te = easeOutCubic((t - T.C0) / (T.C1 - T.C0));
      const cx = lerp(CENTER, LAYOUT.icon.cx, te);
      const cy = lerp(CENTER, LAYOUT.icon.cy, te);
      const w = lerp(BIG_ICON_W, LAYOUT.icon.w, te);
      return place(cx, cy, w, w, 1, stage);
    }
    return place(LAYOUT.icon.cx, LAYOUT.icon.cy, LAYOUT.icon.w, LAYOUT.icon.h, 1, stage);
  });

  const gStyle = useAnimatedStyle(() => {
    const t = progress.value;
    if (t < T.C0) return place(LAYOUT.G.cx, LAYOUT.G.cy, LAYOUT.G.w, LAYOUT.G.h, 0, stage);
    const te = easeOutCubic((t - T.C0) / (T.C1 - T.C0));
    const cx = lerp(-LAYOUT.G.w, LAYOUT.G.cx, te);
    return place(cx, LAYOUT.G.cy, LAYOUT.G.w, LAYOUT.G.h, 1, stage);
  });
  const lStyle = useAnimatedStyle(() => {
    const t = progress.value;
    if (t < T.C0) return place(LAYOUT.L.cx, LAYOUT.L.cy, LAYOUT.L.w, LAYOUT.L.h, 0, stage);
    const te = easeOutCubic((t - T.C0) / (T.C1 - T.C0));
    const cx = lerp(-LAYOUT.L.w * 1.6, LAYOUT.L.cx, te);
    return place(cx, LAYOUT.L.cy, LAYOUT.L.w, LAYOUT.L.h, 1, stage);
  });
  const sStyle = useAnimatedStyle(() => {
    const t = progress.value;
    if (t < T.C0) return place(LAYOUT.S.cx, LAYOUT.S.cy, LAYOUT.S.w, LAYOUT.S.h, 0, stage);
    const te = easeOutCubic((t - T.C0) / (T.C1 - T.C0));
    const cx = lerp(100 + LAYOUT.S.w, LAYOUT.S.cx, te);
    return place(cx, LAYOUT.S.cy, LAYOUT.S.w, LAYOUT.S.h, 1, stage);
  });

  const textStyle = useAnimatedStyle(() => {
    const t = progress.value;
    if (t < T.T0) return place(LAYOUT.text.cx, LAYOUT.text.cy, LAYOUT.text.w, LAYOUT.text.h, 0, stage);
    if (t < T.T1) {
      const te = easeOutCubic((t - T.T0) / (T.T1 - T.T0));
      const cx = lerp(CENTER, LAYOUT.text.cx, te);
      const cy = lerp(CENTER, LAYOUT.text.cy, te);
      const w = lerp(TEXT_BIG_W, LAYOUT.text.w, te);
      const h = w * (LAYOUT.text.h / LAYOUT.text.w);
      const opacity = Math.min(1, ((t - T.T0) / (T.T1 - T.T0)) * 3);
      return place(cx, cy, w, h, opacity, stage);
    }
    return place(LAYOUT.text.cx, LAYOUT.text.cy, LAYOUT.text.w, LAYOUT.text.h, 1, stage);
  });
  const lineLStyle = useAnimatedStyle(() => {
    const t = progress.value;
    if (t < T.T0) return place(LAYOUT.lineL.cx, LAYOUT.lineL.cy, LAYOUT.lineL.w, LAYOUT.lineL.h, 0, stage);
    const te = easeOutCubic((t - T.T0) / (T.T1 - T.T0));
    const cx = lerp(-LAYOUT.lineL.w, LAYOUT.lineL.cx, te);
    return place(cx, LAYOUT.lineL.cy, LAYOUT.lineL.w, LAYOUT.lineL.h, 1, stage);
  });
  const lineRStyle = useAnimatedStyle(() => {
    const t = progress.value;
    if (t < T.T0) return place(LAYOUT.lineR.cx, LAYOUT.lineR.cy, LAYOUT.lineR.w, LAYOUT.lineR.h, 0, stage);
    const te = easeOutCubic((t - T.T0) / (T.T1 - T.T0));
    const cx = lerp(100 + LAYOUT.lineR.w, LAYOUT.lineR.cx, te);
    return place(cx, LAYOUT.lineR.cy, LAYOUT.lineR.w, LAYOUT.lineR.h, 1, stage);
  });

  const fadeStyle = useAnimatedStyle(() => {
    const t = progress.value;
    if (t < T.F1) return { opacity: 0 };
    const te = easeOutCubic((t - T.F1) / (T.G1 - T.F1));
    return { opacity: lerp(0, 1, te) };
  });

  return (
    <View style={styles.root}>
      <View style={[styles.stage, { width: stage, height: stage }]} pointerEvents="none">
        <Animated.Image source={ICON_IMG} style={[styles.stageImg, iconStyle]} resizeMode="stretch" />
        <Animated.Image source={G_IMG} style={[styles.stageImg, gStyle]} resizeMode="stretch" />
        <Animated.Image source={L_IMG} style={[styles.stageImg, lStyle]} resizeMode="stretch" />
        <Animated.Image source={S_IMG} style={[styles.stageImg, sStyle]} resizeMode="stretch" />
        <Animated.Image source={TAG_TEXT_IMG} style={[styles.stageImg, textStyle]} resizeMode="stretch" />
        <Animated.Image source={LINE_L_IMG} style={[styles.stageImg, lineLStyle]} resizeMode="stretch" />
        <Animated.Image source={LINE_R_IMG} style={[styles.stageImg, lineRStyle]} resizeMode="stretch" />
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.fadeOverlay, fadeStyle]} />
      </View>

      <Text style={[styles.poweredBy, { bottom: insets.bottom + 16 }]}>
        Powered by <Text style={styles.poweredByBold}>GreatLeap</Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG, alignItems: 'center', justifyContent: 'center' },
  stage: { position: 'relative' },
  stageImg: { position: 'absolute' },
  fadeOverlay: { backgroundColor: '#000' },
  poweredBy: {
    position: 'absolute',
    alignSelf: 'center',
    fontSize: 8.5,
    fontWeight: '600',
    letterSpacing: 0.68,
    textTransform: 'uppercase',
    color: MUTED,
    opacity: 0.8,
  },
  poweredByBold: { color: INK_SOFT, fontWeight: '700' },
});
