package processor

import (
	"context"
	"fmt"
	"log"
	"os"
	"path/filepath"
)

type StatusUpdater interface {
	UpdateStatus(ctx context.Context, renderID string, status string) error
}

type StorageManager interface {
	DownloadInput(ctx context.Context, sessionID, fileName, destDir string) (string, error)
	UploadResult(ctx context.Context, sessionID, localFilePath string) error
}

type Orchestrator struct {
	notifier StatusUpdater
	storage  StorageManager
}

func NewOrchestrator(notifier StatusUpdater, storage StorageManager) *Orchestrator {
	return &Orchestrator{notifier: notifier, storage: storage}
}

func (o *Orchestrator) ProcessRender(ctx context.Context, task *RenderTask) error {
	log.Printf("Starting render for task: %s", task.RenderID)
	o.notifier.UpdateStatus(ctx, task.RenderID, "PROCESSING")

	// 1. Создаем изолированную временную директорию для сессии
	tmpDir := filepath.Join(os.TempDir(), "worker_"+task.SessionID)
	if err := os.MkdirAll(tmpDir, os.ModePerm); err != nil {
		return fmt.Errorf("failed to create temp dir: %w", err)
	}
	defer os.RemoveAll(tmpDir)

	// 2. Скачиваем все необходимые файлы из MinIO
	uniqueFiles := make(map[string]bool)
	var orderedUniqueFiles []string
	for _, segment := range task.Manifest.Segments {
		if !uniqueFiles[segment.FileName] {
			uniqueFiles[segment.FileName] = true
			orderedUniqueFiles = append(orderedUniqueFiles, segment.FileName)
		}
	}

	for _, fileName := range orderedUniqueFiles {
		log.Printf("Downloading %s from MinIO...", fileName)
		_, err := o.storage.DownloadInput(ctx, task.SessionID, fileName, tmpDir)
		if err != nil {
			o.notifier.UpdateStatus(ctx, task.RenderID, "FAILED")
			return err
		}
	}

	// 3. Формируем аргументы FFmpeg с использованием быстрого поиска (-ss и -to перед -i)
	outputFile := filepath.Join(tmpDir, "final.mp4")
	args := []string{"-y"}

	var filterComplex string
	var concatInputs string

	for i, segment := range task.Manifest.Segments {
		localPath := filepath.Join(tmpDir, segment.FileName)

		// Добавляем параметры обрезки ПЕРЕД флагом -i для точного позиционирования
		if segment.StartFrom != "" {
			args = append(args, "-ss", segment.StartFrom)
		}
		if segment.EndAt != "" {
			args = append(args, "-to", segment.EndAt)
		}

		args = append(args, "-i", localPath)

		// Так как мы обрезали видео на входе, внутри filter_complex нам
		// больше не нужны trim и atrim! Потоки уже заходят чистыми, начиная с 0-й секунды.
		videoLabel := fmt.Sprintf("[v%d]", i)
		audioLabel := fmt.Sprintf("[a%d]", i)

		// Сбрасываем PTS/ANPTS для правильной склейки в concat
		filterComplex += fmt.Sprintf("[%d:v]setpts=PTS-STARTPTS%s;", i, videoLabel)
		filterComplex += fmt.Sprintf("[%d:a]asetpts=PTS-STARTPTS%s;", i, audioLabel)

		concatInputs += videoLabel + audioLabel
	}

	// Склеиваем уже подготовленные и идеально обрезанные потоки
	filterComplex += fmt.Sprintf("%sconcat=n=%d:v=1:a=1[outv][outa]", concatInputs, len(task.Manifest.Segments))

	args = append(args, "-filter_complex", filterComplex, "-map", "[outv]", "-map", "[outa]")
	args = append(args, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", outputFile)

	// 4. Запуск FFmpeg
	log.Println("Running FFmpeg script...")
	if err := ExecuteFFmpeg(ctx, args); err != nil {
		o.notifier.UpdateStatus(ctx, task.RenderID, "FAILED")
		return err
	}

	// 5. Загружаем готовый результат назад в MinIO
	log.Println("Uploading final video to MinIO...")
	if err := o.storage.UploadResult(ctx, task.SessionID, outputFile); err != nil {
		o.notifier.UpdateStatus(ctx, task.RenderID, "FAILED")
		return err
	}

	// 6. Успешный финал
	o.notifier.UpdateStatus(ctx, task.RenderID, "COMPLETED") //
	log.Printf("Render task %s successfully completed", task.RenderID)

	return nil
}
