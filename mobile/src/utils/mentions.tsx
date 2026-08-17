// Mentions are stored as plain-text tokens `@[id:Name]` (matches web's
// MentionTextarea composer) even inside otherwise-HTML post content. Nothing on
// mobile was converting these back into readable text, so raw tokens like
// "@[60:Pranav B]" were leaking straight into comment/post bodies on screen.
import React from 'react';
import { Text, StyleProp, TextStyle } from 'react-native';

const MENTION_TOKEN_RE = /@\[\d+:[^\]]*\]/g;
const MENTION_TOKEN_CAPTURE_RE = /^@\[(\d+):([^\]]*)\]$/;

// Plain-string form — use where JSX isn't available (previews, notifications).
export function stripMentionTokens(text: string): string {
  if (!text) return text;
  return text.replace(MENTION_TOKEN_RE, (token) => {
    const m = token.match(MENTION_TOKEN_CAPTURE_RE);
    return m ? `@${m[2]}` : token;
  });
}

// JSX form — renders `@Name` with its own style (e.g. bold/tinted) inline with
// the surrounding plain text, matching web's mention-chip treatment.
export function renderMentionText(text: string, mentionStyle: StyleProp<TextStyle>): React.ReactNode {
  if (!text) return text;
  const parts = text.split(/(@\[\d+:[^\]]*\])/g);
  if (parts.length === 1) return text;
  return parts.map((part, i) => {
    const m = part.match(MENTION_TOKEN_CAPTURE_RE);
    return m ? <Text key={i} style={mentionStyle}>{`@${m[2]}`}</Text> : part;
  });
}
