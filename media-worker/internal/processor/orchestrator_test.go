package processor

import (
	"strings"
	"testing"
)

func TestConcatFilterGraphNormalizesResolution(t *testing.T) {
	filterComplex := "[0:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setpts=PTS-STARTPTS[v0];"
	filterComplex += "[1:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setpts=PTS-STARTPTS[v1];"
	filterComplex += "[v0][a0][v1][a1]concat=n=2:v=1:a=1[outv][outa]"

	if !strings.Contains(filterComplex, "scale=1920:1080") {
		t.Fatalf("expected scale normalization in filter graph, got %q", filterComplex)
	}

	if !strings.Contains(filterComplex, "concat=n=2:v=1:a=1[outv][outa]") {
		t.Fatalf("expected concat stage in filter graph, got %q", filterComplex)
	}
}
