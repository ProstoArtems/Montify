package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	"media-worker/internal/config"
	"media-worker/internal/processor"
	"media-worker/internal/queue"
	"media-worker/internal/storage"
)

func main() {
	log.Println("Starting Media Worker service...")

	cfg := config.LoadConfig()

	workerQueue := queue.NewWorkerQueue(cfg.RedisAddr, cfg.RedisQueueName)

	// Хранилище MinIO
	minioStorage, err := storage.NewMinioStorage(
		cfg.MinioEndpoint,
		cfg.MinioAccessKey,
		cfg.MinioSecretKey,
		cfg.MinioBucket,
		cfg.MinioUseSSL,
	)
	if err != nil {
		log.Fatalf("Failed to initialize MinIO storage: %v", err)
	}

	orchestrator := processor.NewOrchestrator(workerQueue, minioStorage)

	// Настройка Graceful Shutdown
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	log.Println("Media Worker successfully initialized and waiting for tasks...")

	for {
		select {
		case <-ctx.Done():
			log.Println("Shutting down worker gracefully...")
			return
		default:
			task, err := workerQueue.FetchTask(ctx)
			if err != nil {
				// Если контекст завершился во время ожидания (BLPop прерван)
				if ctx.Err() != nil {
					log.Println("Queue polling stopped due to context cancellation.")
					return
				}
				log.Printf("Error fetching task from queue: %v. Retrying in 5 seconds...", err)
				time.Sleep(5 * time.Second)
				continue
			}

			// Таймаут на одну задачу (например, максимум 10 минут на рендер)
			taskCtx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)

			// Запускаем обработку задачи
			err = orchestrator.ProcessRender(taskCtx, task)
			cancel() // Освобождаем ресурсы таймаута

			if err != nil {
				log.Printf("Error processing task %s: %v", task.RenderID, err)
			}
		}
	}
}
