package processor

import (
	"context"
	"fmt"
	"os/exec"
)

func ExecuteFFmpeg(ctx context.Context, args []string) error {
	// Инициализируем команду ffmpeg с переданными аргументами
	cmd := exec.CommandContext(ctx, "ffmpeg", args...)

	if output, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("ffmpeg error: %w, output: %s", err, string(output))
	}

	return nil
}
