package com.greatleap.mobile.controller;

import com.greatleap.mobile.dto.ApiResponse;
import com.greatleap.mobile.dto.CreatePostRequest;
import com.greatleap.mobile.service.FeedService;
import com.greatleap.mobile.service.UserSyncService;
import jakarta.validation.Valid;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@Slf4j
@RestController
@RequestMapping("/api/apps/{appId}/hr/feed")
public class FeedController extends BaseController {

    private final FeedService feedService;

    public FeedController(UserSyncService userSyncService, FeedService feedService) {
        super(userSyncService);
        this.feedService = feedService;
    }

    @GetMapping
    public ResponseEntity<?> listPosts(@PathVariable long appId, Authentication auth) {
        try {
            long userId = resolveUserId(auth);
            return ResponseEntity.ok(ApiResponse.ok(
                Map.of("posts", feedService.listPosts(appId, userId))));
        } catch (Exception e) {
            log.error("listPosts", e);
            return ResponseEntity.internalServerError().body(ApiResponse.error(e.getMessage()));
        }
    }

    @PostMapping
    public ResponseEntity<?> createPost(@PathVariable long appId,
                                         @Valid @RequestBody CreatePostRequest req,
                                         Authentication auth) {
        try {
            long userId = resolveUserId(auth);
            feedService.createPost(appId, req.getContent(), req.getType(), userId);
            return ResponseEntity.ok(ApiResponse.ok(
                Map.of("posts", feedService.listPosts(appId, userId))));
        } catch (Exception e) {
            log.error("createPost", e);
            return ResponseEntity.internalServerError().body(ApiResponse.error(e.getMessage()));
        }
    }

    @PostMapping("/{postId}/reactions")
    public ResponseEntity<?> addReaction(@PathVariable long appId,
                                          @PathVariable long postId,
                                          @RequestBody Map<String, String> body,
                                          Authentication auth) {
        try {
            long userId = resolveUserId(auth);
            feedService.addReaction(appId, postId, body.getOrDefault("emoji", "❤️"), userId);
            return ResponseEntity.ok(ApiResponse.ok(Map.of("reacted", true)));
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(ApiResponse.error(e.getMessage()));
        }
    }

    @GetMapping("/{postId}/comments")
    public ResponseEntity<?> getComments(@PathVariable long appId,
                                          @PathVariable long postId,
                                          Authentication auth) {
        try {
            return ResponseEntity.ok(ApiResponse.ok(
                Map.of("comments", feedService.getComments(appId, postId))));
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(ApiResponse.error(e.getMessage()));
        }
    }

    @PostMapping("/{postId}/comments")
    public ResponseEntity<?> addComment(@PathVariable long appId,
                                         @PathVariable long postId,
                                         @RequestBody Map<String, String> body,
                                         Authentication auth) {
        try {
            long userId = resolveUserId(auth);
            feedService.addComment(appId, postId, body.get("content"), userId);
            return ResponseEntity.ok(ApiResponse.ok(
                Map.of("comments", feedService.getComments(appId, postId))));
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(ApiResponse.error(e.getMessage()));
        }
    }
}
