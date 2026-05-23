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
@RequestMapping("/api/apps/{appId}/hr")
public class PerformanceController extends BaseController {

    private final TenantDbConfig tenantDb;

    public PerformanceController(UserSyncService userSyncService, TenantDbConfig tenantDb) {
        super(userSyncService);
        this.tenantDb = tenantDb;
    }

    @GetMapping("/performance/cycles")
    public ResponseEntity<?> getCycles(@PathVariable long appId, Authentication auth) {
        try {
            Connection conn = tenantDb.getTenantConnection(appId);
            List<Map<String, Object>> rows = query(conn,
                "SELECT * FROM performance_review_cycles ORDER BY start_date DESC");
            return ResponseEntity.ok(ApiResponse.ok(Map.of("cycles", rows)));
        } catch (Exception e) {
            log.error("getCycles", e);
            return ResponseEntity.internalServerError().body(ApiResponse.error(e.getMessage()));
        }
    }

    @GetMapping("/goals")
    public ResponseEntity<?> getGoals(@PathVariable long appId, Authentication auth) {
        try {
            long userId = resolveUserId(auth);
            Connection conn = tenantDb.getTenantConnection(appId);
            List<Map<String, Object>> rows = query(conn,
                "SELECT g.*, c.name as cycle_name FROM performance_goals g " +
                "LEFT JOIN performance_review_cycles c ON c.id = g.cycle_id " +
                "WHERE g.employee_id IN (SELECT id FROM employees WHERE platform_user_id = ?) " +
                "ORDER BY g.created_at DESC", userId);
            return ResponseEntity.ok(ApiResponse.ok(Map.of("goals", rows)));
        } catch (Exception e) {
            log.error("getGoals", e);
            return ResponseEntity.internalServerError().body(ApiResponse.error(e.getMessage()));
        }
    }

    @PostMapping("/goals")
    public ResponseEntity<?> createGoal(@PathVariable long appId,
                                         @RequestBody Map<String, Object> body,
                                         Authentication auth) {
        try {
            long userId = resolveUserId(auth);
            Connection conn = tenantDb.getTenantConnection(appId);

            // Find employee id for this user
            List<Map<String, Object>> emps = query(conn,
                "SELECT id FROM employees WHERE platform_user_id = ? LIMIT 1", userId);
            if (emps.isEmpty()) return ResponseEntity.badRequest().body(ApiResponse.error("No employee record found"));

            long empId = ((Number) emps.get(0).get("id")).longValue();

            try (PreparedStatement ps = conn.prepareStatement(
                "INSERT INTO performance_goals (employee_id, cycle_id, title, description, due_date, status, created_at) " +
                "VALUES (?, ?, ?, ?, ?, 'draft', datetime('now'))",
                Statement.RETURN_GENERATED_KEYS)) {
                ps.setLong(1, empId);
                ps.setObject(2, body.get("cycle_id"));
                ps.setString(3, (String) body.get("title"));
                ps.setString(4, (String) body.get("description"));
                ps.setString(5, (String) body.get("due_date"));
                ps.executeUpdate();
            }

            return ResponseEntity.ok(ApiResponse.ok(Map.of("created", true)));
        } catch (Exception e) {
            log.error("createGoal", e);
            return ResponseEntity.internalServerError().body(ApiResponse.error(e.getMessage()));
        }
    }

    @GetMapping("/appraisals")
    public ResponseEntity<?> getAppraisals(@PathVariable long appId, Authentication auth) {
        try {
            long userId = resolveUserId(auth);
            Connection conn = tenantDb.getTenantConnection(appId);
            List<Map<String, Object>> rows = query(conn,
                "SELECT a.*, c.name as cycle_name FROM appraisals a " +
                "LEFT JOIN performance_review_cycles c ON c.id = a.cycle_id " +
                "WHERE a.employee_id IN (SELECT id FROM employees WHERE platform_user_id = ?) " +
                "ORDER BY a.created_at DESC", userId);
            return ResponseEntity.ok(ApiResponse.ok(Map.of("appraisals", rows)));
        } catch (Exception e) {
            log.error("getAppraisals", e);
            return ResponseEntity.internalServerError().body(ApiResponse.error(e.getMessage()));
        }
    }

    // ── helpers ─────────────────────────────────────────────────────────────

    private List<Map<String, Object>> query(Connection conn, String sql, Object... params) throws SQLException {
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
