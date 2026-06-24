package com.montify.api.controller;

import com.montify.api.model.UserSession;
import com.montify.api.service.StorageService;
import com.montify.api.service.SessionService;
import org.springframework.core.io.InputStreamResource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import software.amazon.awssdk.core.ResponseInputStream;
import software.amazon.awssdk.services.s3.model.GetObjectResponse;

import java.util.Map;

@RestController
@RequestMapping("/api/v1/files")
public class FileController {

    private final StorageService storageService;
    private final SessionService sessionService;

    public FileController(StorageService storageService, SessionService sessionService) {
        this.storageService = storageService;
        this.sessionService = sessionService;
    }

    @GetMapping("/session/start")
    public ResponseEntity<?> startSession() {
        UserSession session = sessionService.createSession();
        return ResponseEntity.ok(session);
    }

    @PostMapping("/upload")
    public ResponseEntity<?> uploadFile(
            @RequestParam("file") MultipartFile file,
            @RequestHeader("X-Session-ID") String sessionId) {

        if (file.isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("error", "Файл пустой"));
        }

        UserSession session = sessionService.getSession(sessionId);
        if (session == null) {
            return ResponseEntity.status(401).body(Map.of("error", "Невалидная или просроченная сессия"));
        }

        String fileKey = storageService.uploadFile(file, sessionId);
        sessionService.addFileToSession(sessionId, fileKey);

        return ResponseEntity.ok(Map.of(
                "message", "Файл успешно загружен в uploads/ и привязан к сессии",
                "fileKey", fileKey,
                "sessionId", sessionId
        ));
    }

    @GetMapping("/export/{sessionId}")
    public ResponseEntity<InputStreamResource> exportVideo(@PathVariable String sessionId) {
        ResponseInputStream<GetObjectResponse> s3Stream = storageService.getExportedFileStream(sessionId);

        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType("video/mp4"))
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"final_" + sessionId + ".mp4\"")
                .body(new InputStreamResource(s3Stream));
    }
}