package com.greatleap.mobile.service;

import com.greatleap.mobile.config.TenantDbConfig;
import com.greatleap.mobile.dto.CreateTaskRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.sql.*;
import java.util.*;

@Service
@RequiredArgsConstructor
public class TaskService {

    private final TenantDbConfig tenantDb;

    public List<Map<String, Object>> listTasks(long appId, String status, String priority) throws SQLException {
        Connection conn = tenantDb.getTenantConnection(appId);
        StringBuilder sql = new StringBuilder(
            "SELECT t.*, GROUP_CONCAT(e.full_name) as assignee_names " +
            "FROM tasks t LEFT JOIN employees e ON e.id IN " +
            "(SELECT value FROM json_each(t.assignee_ids_json)) " +
            "WHERE 1=1 ");
        List<Object> params = new ArrayList<>();
        if (status != null && !status.isBlank()) { sql.append("AND t.status = ? "); params.add(status); }
        if (priority != null && !priority.isBlank()) { sql.append("AND t.priority = ? "); params.add(priority); }
        sql.append("GROUP BY t.id ORDER BY t.created_at DESC LIMIT 200");

        return query(conn, sql.toString(), params.toArray());
    }

    public Map<String, Object> getTask(long appId, long taskId) throws SQLException {
        Connection conn = tenantDb.getTenantConnection(appId);
        List<Map<String, Object>> rows = query(conn,
            "SELECT * FROM tasks WHERE id = ?", taskId);
        return rows.isEmpty() ? null : rows.get(0);
    }

    public long createTask(long appId, CreateTaskRequest req, long actorUserId) throws SQLException {
        Connection conn = tenantDb.getTenantConnection(appId);
        try (PreparedStatement ps = conn.prepareStatement(
            "INSERT INTO tasks (title, description, status, priority, due_date, created_by_user_id, created_at, updated_at) " +
            "VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))",
            Statement.RETURN_GENERATED_KEYS)) {
            ps.setString(1, req.getTitle());
            ps.setString(2, req.getDescription());
            ps.setString(3, req.getStatus());
            ps.setString(4, req.getPriority());
            ps.setString(5, req.getDueDate());
            ps.setLong(6, actorUserId);
            ps.executeUpdate();
            try (ResultSet rs = ps.getGeneratedKeys()) {
                return rs.next() ? rs.getLong(1) : -1;
            }
        }
    }

    public void updateTask(long appId, long taskId, Map<String, Object> fields) throws SQLException {
        if (fields.isEmpty()) return;
        Connection conn = tenantDb.getTenantConnection(appId);
        List<String> allowed = List.of("title", "description", "status", "priority", "due_date");
        StringBuilder sql = new StringBuilder("UPDATE tasks SET updated_at = datetime('now')");
        List<Object> params = new ArrayList<>();
        for (String key : allowed) {
            if (fields.containsKey(key)) {
                sql.append(", ").append(key).append(" = ?");
                params.add(fields.get(key));
            }
        }
        sql.append(" WHERE id = ?");
        params.add(taskId);
        try (PreparedStatement ps = conn.prepareStatement(sql.toString())) {
            for (int i = 0; i < params.size(); i++) ps.setObject(i + 1, params.get(i));
            ps.executeUpdate();
        }
    }

    public List<Map<String, Object>> getComments(long appId, long taskId) throws SQLException {
        return query(tenantDb.getTenantConnection(appId),
            "SELECT c.*, u.first_name || ' ' || u.last_name as author_name " +
            "FROM task_comments c LEFT JOIN users u ON u.id = c.author_user_id " +
            "WHERE c.task_id = ? ORDER BY c.created_at ASC", taskId);
    }

    public void addComment(long appId, long taskId, String body, long authorUserId) throws SQLException {
        Connection conn = tenantDb.getTenantConnection(appId);
        try (PreparedStatement ps = conn.prepareStatement(
            "INSERT INTO task_comments (task_id, author_user_id, body, created_at) VALUES (?, ?, ?, datetime('now'))")) {
            ps.setLong(1, taskId);
            ps.setLong(2, authorUserId);
            ps.setString(3, body);
            ps.executeUpdate();
        }
    }

    public List<Map<String, Object>> getChecklist(long appId, long taskId) throws SQLException {
        return query(tenantDb.getTenantConnection(appId),
            "SELECT * FROM task_checklists WHERE task_id = ? ORDER BY id ASC", taskId);
    }

    public void addChecklistItem(long appId, long taskId, String label) throws SQLException {
        Connection conn = tenantDb.getTenantConnection(appId);
        try (PreparedStatement ps = conn.prepareStatement(
            "INSERT INTO task_checklists (task_id, label, checked) VALUES (?, ?, 0)")) {
            ps.setLong(1, taskId);
            ps.setString(2, label);
            ps.executeUpdate();
        }
    }

    public void toggleChecklistItem(long appId, long taskId, long itemId, boolean checked) throws SQLException {
        Connection conn = tenantDb.getTenantConnection(appId);
        try (PreparedStatement ps = conn.prepareStatement(
            "UPDATE task_checklists SET checked = ? WHERE id = ? AND task_id = ?")) {
            ps.setInt(1, checked ? 1 : 0);
            ps.setLong(2, itemId);
            ps.setLong(3, taskId);
            ps.executeUpdate();
        }
    }

    public List<Map<String, Object>> getTimeLogs(long appId, long taskId) throws SQLException {
        return query(tenantDb.getTenantConnection(appId),
            "SELECT tl.*, u.first_name || ' ' || u.last_name as user_name " +
            "FROM task_time_logs tl LEFT JOIN users u ON u.id = tl.user_id " +
            "WHERE tl.task_id = ? ORDER BY tl.logged_on DESC", taskId);
    }

    public void startTimer(long appId, long taskId, long userId) throws SQLException {
        Connection conn = tenantDb.getTenantConnection(appId);
        try (PreparedStatement ps = conn.prepareStatement(
            "UPDATE tasks SET timer_start = datetime('now'), timer_user_id = ? WHERE id = ?")) {
            ps.setLong(1, userId);
            ps.setLong(2, taskId);
            ps.executeUpdate();
        }
    }

    public void stopTimer(long appId, long taskId, long userId) throws SQLException {
        Connection conn = tenantDb.getTenantConnection(appId);
        Map<String, Object> task = getTask(appId, taskId);
        if (task == null || task.get("timer_start") == null) return;

        try (var s = conn.createStatement()) {
            s.execute("ALTER TABLE task_time_logs ADD COLUMN duration_seconds INTEGER DEFAULT 0");
        } catch (SQLException ignored) {}

        try (PreparedStatement ps = conn.prepareStatement(
            "INSERT INTO task_time_logs (task_id, user_id, duration_minutes, duration_seconds, logged_on) " +
            "VALUES (?, ?, CAST((julianday('now') - julianday(timer_start)) * 24 * 60 AS INTEGER), " +
            "CAST((julianday('now') - julianday(timer_start)) * 24 * 3600 AS INTEGER), date('now'))")) {
            ps.setLong(1, taskId);
            ps.setLong(2, userId);
            ps.executeUpdate();
        }

        try (PreparedStatement ps = conn.prepareStatement(
            "UPDATE tasks SET timer_start = NULL, timer_user_id = NULL WHERE id = ?")) {
            ps.setLong(1, taskId);
            ps.executeUpdate();
        }
    }

    public List<Map<String, Object>> getTimeline(long appId, long taskId) throws SQLException {
        return query(tenantDb.getTenantConnection(appId),
            "SELECT tt.*, u.first_name || ' ' || u.last_name as actor_name " +
            "FROM task_timeline tt LEFT JOIN users u ON u.id = tt.actor_user_id " +
            "WHERE tt.task_id = ? ORDER BY tt.created_at DESC", taskId);
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
