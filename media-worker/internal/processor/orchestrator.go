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
	// Гарантируем очистку локального диска после завершения шага
	defer os.RemoveAll(tmpDir)

	// 2. Скачиваем все необходимые файлы из MinIO
	for _, segment := range task.Manifest.Segments {
		log.Printf("Downloading %s from MinIO...", segment.FileName)
		_, err := o.storage.DownloadInput(ctx, task.SessionID, segment.FileName, tmpDir)
		if err != nil {
			o.notifier.UpdateStatus(ctx, task.RenderID, "FAILED")
			return err
		}
	}

	// 3. Формируем аргументы FFmpeg с учетом обрезки видео
	outputFile := filepath.Join(tmpDir, "final.mp4")
	args := []string{"-y"}

	// Объявляем все входные файлы
	for _, segment := range task.Manifest.Segments {
		localPath := filepath.Join(tmpDir, segment.FileName)
		args = append(args, "-i", localPath)
	}

	// Строим filter_complex для одновременной обрезки видео и звука
	var filterComplex string
	var concatInputs string // Будем собирать пары [v0][a0][v1][a1] в одну строку

	for i, segment := range task.Manifest.Segments {
		videoLabel := fmt.Sprintf("[v%d]", i)
		audioLabel := fmt.Sprintf("[a%d]", i)

		start := "0"
		if segment.StartFrom != "" {
			start = segment.StartFrom
		}

		// Обрезка видео-потока
		videoTrim := fmt.Sprintf("[%d:v]trim=start=%s", i, start)
		if segment.EndAt != "" {
			videoTrim += fmt.Sprintf(":end=%s", segment.EndAt)
		}
		videoTrim += ",setpts=PTS-STARTPTS" + videoLabel + ";"

		// Обрезка аудио-потока
		audioTrim := fmt.Sprintf("[%d:a]atrim=start=%s", i, start)
		if segment.EndAt != "" {
			audioTrim += fmt.Sprintf(":end=%s", segment.EndAt)
		}
		audioTrim += ",asetpts=PTS-STARTPTS" + audioLabel + ";"

		filterComplex += videoTrim + audioTrim

		// КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: передаем потоки парами (видео, затем аудио для каждого сегмента)
		concatInputs += videoLabel + audioLabel
	}

	// Соединяем видео и аудио через concat. Передаем строго упорядоченные пары.
	filterComplex += fmt.Sprintf("%sconcat=n=%d:v=1:a=1[outv][outa]", concatInputs, len(task.Manifest.Segments))

	// Добавляем фильтр и мапим оба выходных потока
	args = append(args, "-filter_complex", filterComplex, "-map", "[outv]", "-map", "[outa]")

	// Кодеки сборки
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
