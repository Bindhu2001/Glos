import React, { useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { AppColors } from '../../utils/colors';
import { parsePostContent } from '../../utils/postContent';
import { renderMentionText } from '../../utils/mentions';

interface Props {
  content: string;
  colors: AppColors;
  textStyle?: any;
}

export default function PostContentView({ content, colors, textStyle }: Props) {
  const blocks = useMemo(() => parsePostContent(content), [content]);
  const s = useMemo(() => makeStyles(colors), [colors]);

  if (blocks.length === 0) return null;

  return (
    <>
      {blocks.map((b, i) =>
        b.type === 'text' ? (
          <Text key={i} style={[s.text, textStyle]}>{renderMentionText(b.text, s.mention)}</Text>
        ) : (
          <TableBlockView key={i} rows={b.rows} s={s} />
        )
      )}
    </>
  );
}

// RN has no native <table> layout — each row is its own independent flex
// container, so column i isn't automatically the same width in every row the
// way an HTML table's columns are. Without a shared width per column, cells
// just render at whatever width their own text needs and nothing lines up
// under the header above it. Column widths are computed once here (from the
// longest cell in that column, across every row) and applied to every cell
// in that column so the grid actually reads as a grid.
function TableBlockView({ rows, s }: { rows: string[][]; s: ReturnType<typeof makeStyles> }) {
  const colWidths = useMemo(() => {
    const colCount = Math.max(0, ...rows.map((r) => r.length));
    const widths: number[] = [];
    for (let c = 0; c < colCount; c++) {
      const maxChars = Math.max(0, ...rows.map((r) => (r[c] ?? '').length));
      widths.push(Math.min(220, Math.max(70, maxChars * 7 + 24)));
    }
    return widths;
  }, [rows]);

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.tableScroll}>
      <View style={s.table}>
        {rows.map((row, ri) => (
          <View key={ri} style={[s.row, ri === 0 && s.headerRow]}>
            {row.map((cell, ci) => (
              <View key={ci} style={[s.cell, { width: colWidths[ci] }]}>
                <Text style={[s.cellText, ri === 0 && s.headerText]}>{cell}</Text>
              </View>
            ))}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

function makeStyles(c: AppColors) {
  return StyleSheet.create({
    text: { fontSize: 14, color: c.textSecondary, lineHeight: 21, marginBottom: 8 },
    mention: { fontWeight: '700', color: c.primary },
    tableScroll: { marginBottom: 12 },
    table: { borderWidth: 1, borderColor: c.border, borderRadius: 8, overflow: 'hidden' },
    row: { flexDirection: 'row' },
    headerRow: { backgroundColor: c.primaryLight },
    cell: {
      paddingHorizontal: 10, paddingVertical: 8,
      borderRightWidth: 1, borderBottomWidth: 1, borderColor: c.border,
    },
    cellText: { fontSize: 12, color: c.textSecondary },
    headerText: { fontWeight: '700', color: c.textPrimary },
  });
}
