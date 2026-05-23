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
@RequestMapping("/api/apps/{appId}/hr/employees")
public class EmployeeController extends BaseController {

    private final TenantDbConfig tenantDb;

    public EmployeeController(UserSyncService userSyncService, TenantDbConfig tenantDb) {
        super(userSyncService);
        this.tenantDb = tenantDb;
    }

    @GetMapping
    public ResponseEntity<?> listEmployees(@PathVariable long appId, Authentication auth) {
        try {
            Connection conn = tenantDb.getTenantConnection(appId);
            List<Map<String, Object>> rows = query(conn,
                "SELECT e.*, r.title as role_title, d.name as department_name, b.name as branch_name " +
                "FROM employees e " +
                "LEFT JOIN roles r ON r.id = e.role_id " +
                "LEFT JOIN departments d ON d.id = r.department_id " +
                "LEFT JOIN branches b ON b.id = d.branch_id " +
                "WHERE e.status != 'inactive' ORDER BY e.full_name ASC");
            return ResponseEntity.ok(ApiResponse.ok(Map.of("employees", rows)));
        } catch (Exception e) {
            log.error("listEmployees", e);
            return ResponseEntity.internalServerError().body(ApiResponse.error(e.getMessage()));
        }
    }

    @GetMapping("/{employeeId}")
    public ResponseEntity<?> getEmployee(@PathVariable long appId,
                                          @PathVariable long employeeId,
                                          Authentication auth) {
        try {
            Connection conn = tenantDb.getTenantConnection(appId);
            List<Map<String, Object>> rows = query(conn,
                "SELECT e.*, r.title as role_title, d.name as department_name, b.name as branch_name, " +
                "m.full_name as manager_name " +
                "FROM employees e " +
                "LEFT JOIN roles r ON r.id = e.role_id " +
                "LEFT JOIN departments d ON d.id = r.department_id " +
                "LEFT JOIN branches b ON b.id = d.branch_id " +
                "LEFT JOIN employees m ON m.id = e.manager_id " +
                "WHERE e.id = ?", employeeId);
            if (rows.isEmpty()) return ResponseEntity.notFound().build();

            Map<String, Object> emp = rows.get(0);

            // Attach skills
            List<Map<String, Object>> skills = query(conn,
                "SELECT s.id, s.name, es.proficiency FROM employee_skills es " +
                "JOIN skills s ON s.id = es.skill_id WHERE es.employee_id = ?", employeeId);
            emp.put("skills", skills);

            return ResponseEntity.ok(ApiResponse.ok(Map.of("employee", emp)));
        } catch (Exception e) {
            log.error("getEmployee", e);
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
