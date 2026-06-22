package queue

import (
	"context"
	"encoding/json"
	"time"

	"media-worker/internal/processor"

	"github.com/redis/go-redis/v9"
)

type WorkerQueue struct {
	rdb       *redis.Client
	queueName string
}

func NewWorkerQueue(addr, queueName string) *WorkerQueue {
	rdb := redis.NewClient(&redis.Options{
		Addr: addr,
	})
	return &WorkerQueue{rdb: rdb, queueName: queueName}
}

// FetchTask блокирует поток до появления задачи в очереди
func (wq *WorkerQueue) FetchTask(ctx context.Context) (*processor.RenderTask, error) {
	// 0 означает бесконечное ожидание новой задачи
	results, err := wq.rdb.BLPop(ctx, 0, wq.queueName).Result()
	if err != nil {
		return nil, err
	}

	// results[0] — это имя очереди, results[1] — само значение (JSON)
	var task processor.RenderTask
	err = json.Unmarshal([]byte(results[1]), &task)
	if err != nil {
		return nil, err
	}

	return &task, nil
}

// UpdateStatus обновляет статус задачи в Redis для Polling'а со стороны фронтенда
func (wq *WorkerQueue) UpdateStatus(ctx context.Context, renderID string, status string) error {
	// Ключ вида status:job_777, время жизни 1 час (согласно ТЗ Java-бэкенда)
	key := "status:" + renderID
	return wq.rdb.Set(ctx, key, status, time.Hour).Err()
}
