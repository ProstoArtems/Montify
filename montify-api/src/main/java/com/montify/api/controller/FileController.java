package com.montify.api.controller;

import com.montify.api.model.UserSession;
import com.montify.api.service.StorageService;
import com.montify.api.service.SessionService;
import org.springframework.core.io.InputStreamResource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import software.amazon.awssdk.core.ResponseInputStream;
import software.amazon.awssdk.services.s3.model.GetObjectResponse;

import java.util.Map;

import org.springframework.web.bind.annotation.CrossOrigin;

@RestController
@CrossOrigin(origins = "*", allowedHeaders = "*", methods = {RequestMethod.GET, RequestMethod.POST, RequestMethod.OPTIONS})
@RequestMapping("/api/v1/files")
public class FileController {

    private final StorageService storageService;
    private final SessionService sessionService;

    public FileController(StorageService storageService, SessionService sessionService) {
        this.storageService = storageService;
        this.sessionService = sessionService;
    }

    @GetMapping("/download/{sessionId}/{fileKey}")
    public ResponseEntity<InputStreamResource> downloadUploadedFile(@PathVariable String sessionId, @PathVariable String fileKey) {
        ResponseInputStream<GetObjectResponse> s3Stream = storageService.getUploadedFileStream(sessionId, fileKey);

        MediaType mediaType = MediaType.APPLICATION_OCTET_STREAM;
        try {
            String contentType = s3Stream.response().contentType();
            if (contentType != null && !contentType.isBlank()) {
                mediaType = MediaType.parseMediaType(contentType);
            }
        } catch (Exception ignored) {}

        return ResponseEntity.ok()
                .contentType(mediaType)
                .header(HttpHeaders.CONTENT_DISPOSITION, "inline; filename=\"" + fileKey + "\"")
                .body(new InputStreamResource(s3Stream));
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
    public ResponseEntity<InputStreamResource> exportVideo(
            @PathVariable String sessionId,
            @RequestHeader(value = HttpHeaders.RANGE, required = false) String rangeHeader) {

        // Передаем заголовок Range в сервис (реализацию см. ниже)
        ResponseInputStream<GetObjectResponse> s3Stream = storageService.getExportedFileStream(sessionId, rangeHeader);
        GetObjectResponse s3Response = s3Stream.response();

        ResponseEntity.BodyBuilder responseBuilder;

        // Если MinIO вернул часть контента (отвечая на наш Range запрос), возвращаем 206 статус
        if (s3Response.contentRange() != null) {
            responseBuilder = ResponseEntity.status(HttpStatus.PARTIAL_CONTENT)
                    .header(HttpHeaders.CONTENT_RANGE, s3Response.contentRange());
        } else {
            responseBuilder = ResponseEntity.ok();
        }

        return responseBuilder
                .contentType(MediaType.parseMediaType("video/mp4"))
                .header(HttpHeaders.ACCEPT_RANGES, "bytes") // КРИТИЧНО: говорим браузеру, что поддерживаем перемотку по байтам
                .contentLength(s3Response.contentLength()) // Длина именно ТЕКУЩЕГО куска (чрезвычайно важно для 206)
                // Рекомендуется сменить attachment на inline, чтобы браузер воспринимал это как потоковое видео, а не скачиваемый файл
                .header(HttpHeaders.CONTENT_DISPOSITION, "inline; filename=\"final_" + sessionId + ".mp4\"")
                .body(new InputStreamResource(s3Stream));
}
}