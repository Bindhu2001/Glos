package com.greatleap.mobile.controller;

import com.greatleap.mobile.dto.ApiResponse;
import com.greatleap.mobile.dto.CreateCommentRequest;
import com.greatleap.mobile.dto.CreateTaskRequest;
import com.greatleap.mobile.service.TaskService;
import com.greatleap.mobile.service.UserSyncService;
import jakarta.validation.Valid;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@Slf4j
@RestController
@RequestMapping("/api/apps/{appId}/hr/tasks")
public class TaskController extends BaseController {

    private final TaskService taskService;

    public TaskController(UserSyncService userSyncService, TaskService taskService) {
        super(userSyncService);
        this.taskService = taskService;
    }

    @GetMapping
    public ResponseEntity<?> listTasks(@PathVariable long appId,
                                        @RequestParam(required = false) String status,
                                        @RequestParam(required = false) String priority,
                                        Authentication auth) {
        try {
            return ResponseEntity.ok(ApiResponse.ok(
                Map.of("tasks", taskService.listTasks(appId, status, priority))));
        } catch (Exception e) {
            log.error("listTasks", e);
            return ResponseEntity.internalServerError().body(ApiResponse.error(e.getMessage()));
        }
    }

    @GetMapping("/{taskId}")
    public ResponseEntity<?> getTask(@PathVariable long appId,
                                      @PathVariable long taskId,
                                      Authentication auth) {
        try {
            Map<String, Object> task = taskService.getTask(appId, taskId);
            if (task == null) return ResponseEntity.notFound().build();
            return ResponseEntity.ok(ApiResponse.ok(Map.of("task", task)));
        } catch (Exception e) {
            log.error("getTask", e);
            return ResponseEntity.internalServerError().body(ApiResponse.error(e.getMessage()));
        }
    }

    @PostMapping
    public ResponseEntity<?> createTask(@PathVariable long appId,
                                         @Valid @RequestBody CreateTaskRequest req,
                                         Authentication auth) {
        try {
            long userId = resolveUserId(auth);
            long taskId = taskService.createTask(appId, req, userId);
            Map<String, Object> task = taskService.getTask(appId, taskId);
            return ResponseEntity.ok(ApiResponse.ok(Map.of("task", task)));
        } catch (Exception e) {
            log.error("createTask", e);
            return ResponseEntity.internalServerError().body(ApiResponse.error(e.getMessage()));
        }
    }

    @PatchMapping("/{taskId}")
    public ResponseEntity<?> updateTask(@PathVariable long appId,
                                         @PathVariable long taskId,
                                         @RequestBody Map<String, Object> fields,
                                         Authentication auth) {
        try {
            taskService.updateTask(appId, taskId, fields);
            return ResponseEntity.ok(ApiResponse.ok(Map.of("task", taskService.getTask(appId, taskId))));
        } catch (Exception e) {
            log.error("updateTask", e);
            return ResponseEntity.internalServerError().body(ApiResponse.error(e.getMessage()));
        }
    }

    // ── Timer ────────────────────────────────────────────────────────────────

    @PostMapping("/{taskId}/timer/start")
    public ResponseEntity<?> startTimer(@PathVariable long appId,
                                         @PathVariable long taskId,
                                         Authentication auth) {
        try {
            long userId = resolveUserId(auth);
            taskService.startTimer(appId, taskId, userId);
            return ResponseEntity.ok(ApiResponse.ok(Map.of("started", true)));
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(ApiResponse.error(e.getMessage()));
        }
    }

    @PostMapping("/{taskId}/timer/stop")
    public ResponseEntity<?> stopTimer(@PathVariable long appId,
                                        @PathVariable long taskId,
                                        Authentication auth) {
        try {
            long userId = resolveUserId(auth);
            taskService.stopTimer(appId, taskId, userId);
            return ResponseEntity.ok(ApiResponse.ok(Map.of("stopped", true)));
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(ApiResponse.error(e.getMessage()));
        }
    }

    // ── Comments ─────────────────────────────────────────────────────────────

    @GetMapping("/{taskId}/comments")
    public ResponseEntity<?> getComments(@PathVariable long appId,
                                          @PathVariable long taskId,
                                          Authentication auth) {
        try {
            return ResponseEntity.ok(ApiResponse.ok(
                Map.of("comments", taskService.getComments(appId, taskId))));
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(ApiResponse.error(e.getMessage()));
        }
    }

    @PostMapping("/{taskId}/comments")
    public ResponseEntity<?> addComment(@PathVariable long appId,
                                         @PathVariable long taskId,
                                         @Valid @RequestBody CreateCommentRequest req,
                                         Authentication auth) {
        try {
            long userId = resolveUserId(auth);
            taskService.addComment(appId, taskId, req.getBody(), userId);
            return ResponseEntity.ok(ApiResponse.ok(
                Map.of("comments", taskService.getComments(appId, taskId))));
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(ApiResponse.error(e.getMessage()));
        }
    }

    // ── Checklist ────────────────────────────────────────────────────────────

    @GetMapping("/{taskId}/checklist")
    public ResponseEntity<?> getChecklist(@PathVariable long appId,
                                           @PathVariable long taskId,
                                           Authentication auth) {
        try {
            return ResponseEntity.ok(ApiResponse.ok(
                Map.of("items", taskService.getChecklist(appId, taskId))));
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(ApiResponse.error(e.getMessage()));
        }
    }

    @PostMapping("/{taskId}/checklist")
    public ResponseEntity<?> addChecklistItem(@PathVariable long appId,
                                               @PathVariable long taskId,
                                               @RequestBody Map<String, String> body,
                                               Authentication auth) {
        try {
            taskService.addChecklistItem(appId, taskId, body.get("label"));
            return ResponseEntity.ok(ApiResponse.ok(
                Map.of("items", taskService.getChecklist(appId, taskId))));
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(ApiResponse.error(e.getMessage()));
        }
    }

    @PatchMapping("/{taskId}/checklist/{itemId}")
    public ResponseEntity<?> toggleChecklistItem(@PathVariable long appId,
                                                  @PathVariable long taskId,
                                                  @PathVariable long itemId,
                                                  @RequestBody Map<String, Boolean> body,
                                                  Authentication auth) {
        try {
            taskService.toggleChecklistItem(appId, taskId, itemId, Boolean.TRUE.equals(body.get("checked")));
            return ResponseEntity.ok(ApiResponse.ok(Map.of("updated", true)));
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(ApiResponse.error(e.getMessage()));
        }
    }

    // ── Time Logs ────────────────────────────────────────────────────────────

    @GetMapping("/{taskId}/time-logs")
    public ResponseEntity<?> getTimeLogs(@PathVariable long appId,
                                          @PathVariable long taskId,
                                          Authentication auth) {
        try {
            return ResponseEntity.ok(ApiResponse.ok(
                Map.of("logs", taskService.getTimeLogs(appId, taskId))));
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(ApiResponse.error(e.getMessage()));
        }
    }

    // ── Timeline ─────────────────────────────────────────────────────────────

    @GetMapping("/{taskId}/timeline")
    public ResponseEntity<?> getTimeline(@PathVariable long appId,
                                          @PathVariable long taskId,
                                          Authentication auth) {
        try {
            return ResponseEntity.ok(ApiResponse.ok(
                Map.of("events", taskService.getTimeline(appId, taskId))));
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(ApiResponse.error(e.getMessage()));
        }
    }
}
