package processor

import (
	"context"
	"fmt"
	"os/exec"
	"strings"
)

func ExecuteFFmpeg(ctx context.Context, args []string) error {
	// Инициализируем команду ffmpeg с переданными аргументами
	var command strings.Builder
	for _, arg := range args {
		command.WriteString(arg + " ")
	}
	result := command.String()
	fmt.Println(result)

	cmd := exec.CommandContext(ctx, "ffmpeg", args...)

	if output, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("ffmpeg error: %w, output: %s", err, string(output))
	}

	return nil
}
