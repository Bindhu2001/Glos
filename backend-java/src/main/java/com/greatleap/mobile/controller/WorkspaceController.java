package com.greatleap.mobile.controller;

import com.greatleap.mobile.dto.ApiResponse;
import com.greatleap.mobile.service.UserSyncService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@Slf4j
@RestController
@RequestMapping("/api")
public class WorkspaceController extends BaseController {

    private final JdbcTemplate jdbc;

    public WorkspaceController(UserSyncService userSyncService, JdbcTemplate jdbc) {
        super(userSyncService);
        this.jdbc = jdbc;
    }

    @GetMapping("/apps")
    public ResponseEntity<?> listApps(Authentication auth) {
        try {
            long userId = resolveUserId(auth);
            List<Map<String, Object>> apps = jdbc.queryForList(
                "SELECT a.id, a.name, a.type, m.role " +
                "FROM apps a JOIN app_memberships m ON m.app_id = a.id " +
                "WHERE m.user_id = ? ORDER BY a.name ASC",
                userId);
            return ResponseEntity.ok(ApiResponse.ok(Map.of("apps", apps)));
        } catch (Exception e) {
            log.error("listApps", e);
            return ResponseEntity.internalServerError().body(ApiResponse.error(e.getMessage()));
        }
    }

    @GetMapping("/apps/{appId}")
    public ResponseEntity<?> getApp(@PathVariable long appId, Authentication auth) {
        try {
            long userId = resolveUserId(auth);
            List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT a.*, m.role FROM apps a JOIN app_memberships m ON m.app_id = a.id " +
                "WHERE a.id = ? AND m.user_id = ?", appId, userId);
            if (rows.isEmpty()) return ResponseEntity.notFound().build();
            return ResponseEntity.ok(ApiResponse.ok(Map.of("app", rows.get(0))));
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(ApiResponse.error(e.getMessage()));
        }
    }

    @GetMapping("/apps/{appId}/members")
    public ResponseEntity<?> getMembers(@PathVariable long appId, Authentication auth) {
        try {
            List<Map<String, Object>> members = jdbc.queryForList(
                "SELECT u.id, u.first_name, u.last_name, u.email, m.role " +
                "FROM users u JOIN app_memberships m ON m.user_id = u.id " +
                "WHERE m.app_id = ? ORDER BY u.first_name ASC", appId);
            return ResponseEntity.ok(ApiResponse.ok(Map.of("members", members)));
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(ApiResponse.error(e.getMessage()));
        }
    }

    @GetMapping("/me")
    public ResponseEntity<?> getMe(Authentication auth) {
        try {
            Map<String, Object> user = resolveUser(auth);
            return ResponseEntity.ok(ApiResponse.ok(user));
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(ApiResponse.error(e.getMessage()));
        }
    }
}
