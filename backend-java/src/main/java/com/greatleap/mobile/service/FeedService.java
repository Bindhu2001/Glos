package com.greatleap.mobile.service;

import com.greatleap.mobile.config.TenantDbConfig;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.sql.*;
import java.util.*;

@Service
@RequiredArgsConstructor
public class FeedService {

    private final TenantDbConfig tenantDb;

    public List<Map<String, Object>> listPosts(long appId, long viewerUserId) throws SQLException {
        return query(tenantDb.getTenantConnection(appId),
            "SELECT p.*, u.first_name || ' ' || u.last_name as author_name, " +
            "(SELECT COUNT(*) FROM feed_post_reactions r WHERE r.post_id = p.id) as reaction_count, " +
            "(SELECT COUNT(*) FROM feed_comments c WHERE c.post_id = p.id) as comment_count " +
            "FROM feed_posts p LEFT JOIN users u ON u.id = p.author_user_id " +
            "WHERE p.id NOT IN (" +
            "  SELECT post_id FROM feed_post_audience WHERE post_id = p.id AND ? NOT IN (" +
            "    SELECT user_id FROM feed_post_audience a2 WHERE a2.post_id = p.id)) " +
            "ORDER BY p.created_at DESC LIMIT 100",
            viewerUserId);
    }

    public long createPost(long appId, String content, String type, long authorUserId) throws SQLException {
        Connection conn = tenantDb.getTenantConnection(appId);
        try (PreparedStatement ps = conn.prepareStatement(
            "INSERT INTO feed_posts (content, type, author_user_id, created_at) VALUES (?, ?, ?, datetime('now'))",
            Statement.RETURN_GENERATED_KEYS)) {
            ps.setString(1, content);
            ps.setString(2, type);
            ps.setLong(3, authorUserId);
            ps.executeUpdate();
            try (ResultSet rs = ps.getGeneratedKeys()) {
                return rs.next() ? rs.getLong(1) : -1;
            }
        }
    }

    public void addReaction(long appId, long postId, String emoji, long userId) throws SQLException {
        Connection conn = tenantDb.getTenantConnection(appId);
        try (PreparedStatement ps = conn.prepareStatement(
            "INSERT OR REPLACE INTO feed_post_reactions (post_id, user_id, emoji, created_at) VALUES (?, ?, ?, datetime('now'))")) {
            ps.setLong(1, postId);
            ps.setLong(2, userId);
            ps.setString(3, emoji);
            ps.executeUpdate();
        }
    }

    public List<Map<String, Object>> getComments(long appId, long postId) throws SQLException {
        return query(tenantDb.getTenantConnection(appId),
            "SELECT c.*, u.first_name || ' ' || u.last_name as author_name " +
            "FROM feed_comments c LEFT JOIN users u ON u.id = c.author_user_id " +
            "WHERE c.post_id = ? ORDER BY c.created_at ASC", postId);
    }

    public void addComment(long appId, long postId, String content, long authorUserId) throws SQLException {
        Connection conn = tenantDb.getTenantConnection(appId);
        try (PreparedStatement ps = conn.prepareStatement(
            "INSERT INTO feed_comments (post_id, author_user_id, content, created_at) VALUES (?, ?, ?, datetime('now'))")) {
            ps.setLong(1, postId);
            ps.setLong(2, authorUserId);
            ps.setString(3, content);
            ps.executeUpdate();
        }
    }

    // ── helpers ─────────────────────────────────────────────────────────────

    private List<Map<String, Object>> query(Connection conn, String sql, Object... params) throws SQLException {
        try (PreparedStatement ps = conn.prepareStatement(sql)) {
            for (int i = 0; i < params.length; i++) ps.setObject(i + 1, params[i]);
            try (ResultSet rs = ps.executeQuery()) {
                return mapResultSet(rs);
            }
        }
    }

    private List<Map<String, Object>> mapResultSet(ResultSet rs) throws SQLException {
        ResultSetMetaData meta = rs.getMetaData();
        int cols = meta.getColumnCount();
        List<Map<String, Object>> rows = new ArrayList<>();
        while (rs.next()) {
            Map<String, Object> row = new LinkedHashMap<>();
            for (int i = 1; i <= cols; i++) row.put(meta.getColumnName(i), rs.getObject(i));
            rows.add(row);
        }
        return rows;
    }
}
