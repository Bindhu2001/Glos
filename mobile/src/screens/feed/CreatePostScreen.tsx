import React, { useState, useMemo } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useRoute, RouteProp, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApi } from '../../hooks/useApi';
import { useTheme } from '../../contexts/ThemeContext';
import { AppColors } from '../../utils/colors';
import { FeedStackParamList } from '../../navigation/types';
import ScreenHeader from '../../components/common/ScreenHeader';
import Input from '../../components/common/Input';
import Button from '../../components/common/Button';

type Route = RouteProp<FeedStackParamList, 'CreatePost'>;

const POST_TYPES = [
  { value: 'post', label: '📝 Post', desc: 'Share an update' },
  { value: 'announcement', label: '📢 Announcement', desc: 'Broadcast to the team' },
];

export default function CreatePostScreen() {
  const route = useRoute<Route>();
  const { appId } = route.params;
  const navigation = useNavigation();
  const api = useApi();
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();

  const [type, setType] = useState('post');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);

  const handleCreate = async () => {
    if (!content.trim()) {
      Alert.alert('Validation', 'Post content is required.');
      return;
    }
    setSaving(true);
    try {
      await api.feed.create(appId, { post_type: type, content: content.trim() });
      navigation.goBack();
    } catch {
      Alert.alert('Error', 'Could not create post.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[s.container, { paddingTop: insets.top }]}>
        <ScreenHeader
          title="New Post"
          showBack
          right={<Button label="Post" onPress={handleCreate} loading={saving} style={s.postBtn} />}
        />
        <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
          <Text style={s.fieldLabel}>Post Type</Text>
          <View style={s.typeGrid}>
            {POST_TYPES.map((pt) => (
              <TouchableOpacity
                key={pt.value}
                style={[s.typeCard, type === pt.value && s.typeCardActive]}
                onPress={() => setType(pt.value)}
              >
                <Text style={s.typeEmoji}>{pt.label}</Text>
                <Text style={[s.typeDesc, type === pt.value && { color: colors.primary }]}>{pt.desc}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Input
            label="What's on your mind?"
            value={content}
            onChangeText={setContent}
            placeholder="Share an update, appreciation, or feedback..."
            multiline
            numberOfLines={6}
          />
          <Text style={s.charCount}>{content.length}/500</Text>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

function makeStyles(c: AppColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    content: { padding: 16, paddingBottom: 40 },
    postBtn: { paddingVertical: 8, paddingHorizontal: 16 },
    fieldLabel: { fontSize: 13, fontWeight: '600', color: c.gray700, marginBottom: 10 },
    typeGrid: { gap: 8, marginBottom: 20 },
    typeCard: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      backgroundColor: c.surface, borderRadius: 12, padding: 14,
      borderWidth: 1.5, borderColor: c.border,
    },
    typeCardActive: { borderColor: c.primary, backgroundColor: c.primaryLight },
    typeEmoji: { fontSize: 15, fontWeight: '600', color: c.textPrimary },
    typeDesc: { fontSize: 13, color: c.gray500 },
    charCount: { fontSize: 12, color: c.gray400, textAlign: 'right', marginTop: 4 },
  });
}
