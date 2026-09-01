// Single source of truth for appreciation badges — matches web's BADGE_META
// (Feed.jsx). Previously duplicated separately in FeedScreen.tsx, PostCard.tsx,
// PostDetailScreen.tsx (all agreeing) and GiveAppreciationModal.tsx (which had
// drifted: leadership showed 👑 here but 🌟 everywhere else, excellence ⭐ vs
// 🏆, customer_focus 🎯 "Customer" vs 💛 "Customer Focus") — the badge picker
// didn't match what the badge actually rendered as afterward. One shared list
// makes that class of drift impossible.
export interface BadgeMeta {
  key: string;
  emoji: string;
  label: string;
}

export const BADGES: BadgeMeta[] = [
  { key: 'teamwork', emoji: '🤝', label: 'Teamwork' },
  { key: 'innovation', emoji: '💡', label: 'Innovation' },
  { key: 'leadership', emoji: '🌟', label: 'Leadership' },
  { key: 'excellence', emoji: '🏆', label: 'Excellence' },
  { key: 'mentorship', emoji: '🎓', label: 'Mentorship' },
  { key: 'customer_focus', emoji: '💛', label: 'Customer Focus' },
  { key: 'problem_solving', emoji: '🔧', label: 'Problem Solving' },
];

export const BADGE_META: Record<string, { emoji: string; label: string }> = Object.fromEntries(
  BADGES.map((b) => [b.key, { emoji: b.emoji, label: b.label }])
);
