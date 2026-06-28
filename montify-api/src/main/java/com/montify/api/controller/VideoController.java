package com.montify.api.controller;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.montify.api.dto.request.RenderTaskDto;
import com.montify.api.dto.request.RenderSegmentDto;
import com.montify.api.dto.queue.RedisRenderTaskDto;
import com.montify.api.dto.queue.RedisManifestDto;
import com.montify.api.dto.queue.RedisSegmentDto;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;

import org.springframework.web.bind.annotation.CrossOrigin;

@RestController
@CrossOrigin(origins = "*", allowedHeaders = "*", methods = {RequestMethod.GET, RequestMethod.POST, RequestMethod.OPTIONS})
@RequestMapping("/api/v1/videos")
public class VideoController {

    private final StringRedisTemplate redisTemplate;
    private final String queueKey;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public VideoController(StringRedisTemplate redisTemplate,
                           @Value("${app.redis.queue-name}") String queueKey) {
        this.redisTemplate = redisTemplate;
        this.queueKey = queueKey;
    }

    @GetMapping("/status")
    public Map<String, String> getStatus() {
        return Map.of(
                "status", "OK",
                "service", "Montify API"
        );
    }

    @GetMapping("/status/{renderId}")
    public ResponseEntity<?> getRenderStatus(@PathVariable String renderId) {
        String status = redisTemplate.opsForValue().get("status:" + renderId);

        if (status == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(Map.of("error", "Задача с таким renderId не найдена"));
        }

        return ResponseEntity.ok(Map.of(
                "render_id", renderId,
                "status", status
        ));
    }

    @PostMapping("/render")
    public ResponseEntity<?> startRender(@RequestBody RenderTaskDto httpRequest) {
        try {
            String renderId = httpRequest.getRenderId();

            if (renderId == null || renderId.isBlank()) {
                return ResponseEntity.badRequest().body(Map.of("error", "Поле renderId обязательно для заполнения"));
            }

            redisTemplate.opsForValue().set("status:" + renderId, "PROCESSING", 24, TimeUnit.HOURS);

            List<RedisSegmentDto> redisSegments = new ArrayList<>();
            for (RenderSegmentDto httpSegment : httpRequest.getSegments()) {
                String startFrom = formatTime(httpSegment.getStart());
                String endAt = formatTime(httpSegment.getEnd());

                redisSegments.add(new RedisSegmentDto(
                        httpSegment.getFileKey(),
                        startFrom,
                        endAt
                ));
            }

            RedisManifestDto manifest = new RedisManifestDto(redisSegments);
            RedisRenderTaskDto redisTask = new RedisRenderTaskDto(
                    httpRequest.getSessionId(),
                    renderId,
                    manifest
                );

            String redisJsonPayload = objectMapper.writeValueAsString(redisTask);
            redisTemplate.opsForList().leftPush(queueKey, redisJsonPayload);

            return ResponseEntity.ok(Map.of("message", "Задача добавлена в Redis queue через LPUSH"));

        } catch (JsonProcessingException e) {
            return ResponseEntity.internalServerError().body(Map.of("error", "Ошибка трансформации JSON"));
        }
    }

    private String formatTime(int totalSeconds) {
        int hours = totalSeconds / 3600;
        int minutes = (totalSeconds % 3600) / 60;
        int seconds = totalSeconds % 60;
        return String.format("%02d:%02d:%02d", hours, minutes, seconds);
    }
}