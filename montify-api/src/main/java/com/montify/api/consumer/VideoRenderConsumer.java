package com.montify.api.consumer;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.montify.api.dto.RenderTaskDto;
import com.montify.api.service.StorageService;
import jakarta.annotation.PreDestroy;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;

@Component
public class VideoRenderConsumer {

    private final StringRedisTemplate redisTemplate;
    private final StorageService storageService;

    private final ObjectMapper objectMapper = new ObjectMapper();

    private static final String QUEUE_KEY = "video_render_queue";
    private volatile boolean isRunning = true;

    public VideoRenderConsumer(StringRedisTemplate redisTemplate, StorageService storageService) {
        this.redisTemplate = redisTemplate;
        this.storageService = storageService;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void startListening() {
        Thread.startVirtualThread(() -> {
            System.out.println("=== Слушатель очереди [" + QUEUE_KEY + "] успешно запущен ===");

            while (isRunning) {
                try {
                    String rawJson = redisTemplate.opsForList().leftPop(QUEUE_KEY, Duration.ofSeconds(5));

                    if (rawJson != null) {
                        RenderTaskDto task = objectMapper.readValue(rawJson, RenderTaskDto.class);
                        System.out.println("\n[Redis Queue] Поймали таску на рендер! Render ID: " + task.getRenderId());
                        processRender(task);
                    }
                } catch (JsonProcessingException e) {
                    System.err.println("Ошибка парсинга JSON манифеста: " + e.getMessage());
                } catch (Exception e) {
                    System.err.println("Ошибка при обработке задачи из очереди: " + e.getMessage());
                }
            }
            System.out.println("=== Слушатель очереди [" + QUEUE_KEY + "] остановлен ===");
        });
    }

    @PreDestroy
    public void stopListening() {
        this.isRunning = false;
    }

    private void processRender(RenderTaskDto task) {
        String sessionId = task.getSessionId();
        String renderId = task.getRenderId();

        Path tempDir;
        try {
            tempDir = Files.createTempDirectory("render-" + renderId + "-");
            System.out.println("[Render Engine] Создана рабочая папка: " + tempDir.toAbsolutePath());
        } catch (IOException e) {
            System.err.println("Не удалось создать временную папку: " + e.getMessage());
            return;
        }

        if (task.getManifest() != null && task.getManifest().getSegments() != null) {
            task.getManifest().getSegments().forEach(segment -> {
                String minioKey = "uploads/" + sessionId + "/" + segment.getFileName();
                Path localFilePath = tempDir.resolve(segment.getFileName());

                System.out.println("[Render Engine] Скачиваем сегмент: " + segment.getFileName());
                storageService.downloadFile(minioKey, localFilePath);
            });
        }

        String outputPath = "exports/" + sessionId + "/final.mp4";
        System.out.println("[Render Engine] Все исходники собраны в локальной папке. Готовы к склейке!");
        System.out.println("[Render Engine] Результат будет сохранен в: " + outputPath);
    }
}