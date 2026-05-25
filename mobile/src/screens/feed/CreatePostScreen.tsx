import React, { useState, useMemo } from 'react';
import {
  View, Text, ScrollView, StyleSheet,
  Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { showAlert } from '../../components/common/AlertModal';
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

export default function CreatePostScreen() {
  const route = useRoute<Route>();
  const { appId } = route.params;
  const navigation = useNavigation();
  const api = useApi();
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();

  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);

  const handleCreate = async () => {
    if (!content.trim()) {
      showAlert('Validation', 'Post content is required.');
      return;
    }
    setSaving(true);
    try {
      await api.feed.create(appId, { post_type: 'post', content: content.trim() });
      navigation.goBack();
    } catch {
      showAlert('Error', 'Could not create post.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={[s.container, { paddingTop: insets.top }]}>
        <ScreenHeader
          title="New Post"
          showBack
          right={<Button label="Post" onPress={handleCreate} loading={saving} style={s.postBtn} />}
        />
        <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
          <Input
            label="What's on your mind?"
            value={content}
            onChangeText={setContent}
            placeholder="Share an update, appreciation, or feedback..."
            multiline
            numberOfLines={6}
            maxLength={500}
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
    charCount: { fontSize: 12, color: c.gray400, textAlign: 'right', marginTop: 4 },
  });
}
