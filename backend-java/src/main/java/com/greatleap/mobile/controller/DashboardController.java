package com.greatleap.mobile.controller;

import com.greatleap.mobile.config.TenantDbConfig;
import com.greatleap.mobile.dto.ApiResponse;
import com.greatleap.mobile.service.UserSyncService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.sql.*;
import java.util.*;

@Slf4j
@RestController
@RequestMapping("/api/apps/{appId}/hr/dashboard")
public class DashboardController extends BaseController {

    private final TenantDbConfig tenantDb;

    public DashboardController(UserSyncService userSyncService, TenantDbConfig tenantDb) {
        super(userSyncService);
        this.tenantDb = tenantDb;
    }

    @GetMapping("/me")
    public ResponseEntity<?> myDashboard(@PathVariable long appId, Authentication auth) {
        try {
            long userId = resolveUserId(auth);
            Connection conn = tenantDb.getTenantConnection(appId);

            // Count tasks assigned to this user
            Integer assignedCount = querySingle(conn,
                "SELECT COUNT(*) FROM tasks WHERE json_each.value = ? " +
                "AND EXISTS (SELECT 1 FROM json_each(assignee_ids_json) WHERE value = ?)",
                userId, userId);

            Integer completedCount = querySingle(conn,
                "SELECT COUNT(*) FROM tasks WHERE status = 'done' AND " +
                "EXISTS (SELECT 1 FROM json_each(assignee_ids_json) WHERE value = ?)", userId);

            Integer goalsCount = querySingle(conn,
                "SELECT COUNT(*) FROM performance_goals WHERE employee_id IN " +
                "(SELECT id FROM employees WHERE platform_user_id = ?) AND status != 'achieved'", userId);

            Integer timeLogged = querySingle(conn,
                "SELECT COALESCE(SUM(duration_minutes), 0) FROM task_time_logs WHERE user_id = ?", userId);

            // Recent tasks
            List<Map<String, Object>> recentTasks = queryList(conn,
                "SELECT id, title, status, priority FROM tasks WHERE " +
                "EXISTS (SELECT 1 FROM json_each(assignee_ids_json) WHERE value = ?) " +
                "ORDER BY updated_at DESC LIMIT 5", userId);

            Map<String, Object> data = new LinkedHashMap<>();
            data.put("assigned_tasks_count", assignedCount == null ? 0 : assignedCount);
            data.put("completed_tasks_count", completedCount == null ? 0 : completedCount);
            data.put("pending_goals_count", goalsCount == null ? 0 : goalsCount);
            data.put("total_time_logged_minutes", timeLogged == null ? 0 : timeLogged);
            data.put("recent_tasks", recentTasks);

            return ResponseEntity.ok(ApiResponse.ok(data));
        } catch (Exception e) {
            log.error("myDashboard", e);
            return ResponseEntity.internalServerError().body(ApiResponse.error(e.getMessage()));
        }
    }

    // ── helpers ─────────────────────────────────────────────────────────────

    private Integer querySingle(Connection conn, String sql, Object... params) throws SQLException {
        try (PreparedStatement ps = conn.prepareStatement(sql)) {
            for (int i = 0; i < params.length; i++) ps.setObject(i + 1, params[i]);
            try (ResultSet rs = ps.executeQuery()) {
                return rs.next() ? rs.getInt(1) : null;
            }
        }
    }

    private List<Map<String, Object>> queryList(Connection conn, String sql, Object... params) throws SQLException {
        try (PreparedStatement ps = conn.prepareStatement(sql)) {
            for (int i = 0; i < params.length; i++) ps.setObject(i + 1, params[i]);
            try (ResultSet rs = ps.executeQuery()) {
                ResultSetMetaData meta = rs.getMetaData();
                int cols = meta.getColumnCount();
                List<Map<String, Object>> list = new ArrayList<>();
                while (rs.next()) {
                    Map<String, Object> row = new LinkedHashMap<>();
                    for (int i = 1; i <= cols; i++) row.put(meta.getColumnName(i), rs.getObject(i));
                    list.add(row);
                }
                return list;
            }
        }
    }
}
