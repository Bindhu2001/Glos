// Mentions are stored as plain-text tokens `@[id:Name]` (matches web's
// MentionTextarea composer) even inside otherwise-HTML post content. Nothing on
// mobile was converting these back into readable text, so raw tokens like
// "@[60:Pranav B]" were leaking straight into comment/post bodies on screen.
//
// Also handles plain URLs the same way web does — chat messages and feed
// posts previously rendered a pasted link as inert text with no way to open
// it; renderMentionText now linkifies both mentions and URLs in one pass.
import React from 'react';
import { Text, Linking, StyleProp, TextStyle } from 'react-native';

const MENTION_TOKEN_RE = /@\[\d+:[^\]]*\]/g;
const MENTION_TOKEN_CAPTURE_RE = /^@\[(\d+):([^\]]*)\]$/;
// Matches web's URL_RE (Chat.jsx) — bare http(s)/www links, stopping at
// whitespace or the quote/bracket characters that would otherwise swallow
// trailing punctuation from surrounding text.
const URL_SOURCE = String.raw`(?:https?:\/\/[^\s<>"']+|www\.[^\s<>"']+)`;
const URL_TEST_RE = new RegExp(`^${URL_SOURCE}$`);
const SPLIT_RE = new RegExp(`(${MENTION_TOKEN_RE.source}|${URL_SOURCE})`, 'g');

// Plain-string form — use where JSX isn't available (previews, notifications).
export function stripMentionTokens(text: string): string {
  if (!text) return text;
  return text.replace(MENTION_TOKEN_RE, (token) => {
    const m = token.match(MENTION_TOKEN_CAPTURE_RE);
    return m ? `@${m[2]}` : token;
  });
}

function openLink(url: string) {
  const href = url.startsWith('http') ? url : `https://${url}`;
  Linking.openURL(href).catch(() => {});
}

// JSX form — renders `@Name` mentions with their own style and bare URLs as
// tappable links, inline with the surrounding plain text.
export function renderMentionText(
  text: string,
  mentionStyle: StyleProp<TextStyle>,
  linkStyle?: StyleProp<TextStyle>
): React.ReactNode {
  if (!text) return text;
  const parts = text.split(SPLIT_RE);
  if (parts.length === 1) return text;
  return parts.map((part, i) => {
    const m = part.match(MENTION_TOKEN_CAPTURE_RE);
    if (m) return <Text key={i} style={mentionStyle}>{`@${m[2]}`}</Text>;
    if (URL_TEST_RE.test(part)) {
      return (
        <Text key={i} style={linkStyle ?? styles.link} onPress={() => openLink(part)} suppressHighlighting>
          {part}
        </Text>
      );
    }
    return part;
  });
}

const styles = { link: { color: '#1D63DE', textDecorationLine: 'underline' as const } };
