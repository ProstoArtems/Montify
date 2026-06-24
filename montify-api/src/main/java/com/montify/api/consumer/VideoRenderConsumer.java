package com.montify.api.consumer;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.montify.api.dto.RenderTaskDto;
import jakarta.annotation.PreDestroy;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

import java.time.Duration;

@Component
public class VideoRenderConsumer {

    private final StringRedisTemplate redisTemplate;
    private final ObjectMapper objectMapper = new ObjectMapper();

    private static final String QUEUE_KEY = "video_render_queue";
    private volatile boolean isRunning = true;

    public VideoRenderConsumer(StringRedisTemplate redisTemplate) {
        this.redisTemplate = redisTemplate;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void startListening() {
        Thread.startVirtualThread(() -> {
            while (isRunning) {
                try {
                    String rawJson = redisTemplate.opsForList().leftPop(QUEUE_KEY, Duration.ofSeconds(5));

                    if (rawJson != null) {
                        RenderTaskDto task = objectMapper.readValue(rawJson, RenderTaskDto.class);
                        processRender(task);
                    }
                } catch (JsonProcessingException e) {
                    System.err.println("Ошибка парсинга JSON: " + e.getMessage());
                } catch (Exception e) {
                    System.err.println("Ошибка очереди: " + e.getMessage());
                }
            }
        });
    }

    @PreDestroy
    public void stopListening() {
        this.isRunning = false;
    }

    private void processRender(RenderTaskDto task) {
        String sessionId = task.getSessionId();
        String renderId = task.getRenderId();

        System.out.println("[Render Engine] Задача " + renderId + " маршрутизирована. Ожидается финальный файл: exports/" + sessionId + "/final.mp4");
    }
}