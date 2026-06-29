package processor

type RenderTask struct {
	RenderID  string           `json:"render_id"`
	SessionID string           `json:"session_id"`
	Manifest  TimelineManifest `json:"manifest"`
}

type VideoSegment struct {
	FileName  string `json:"file_name"`
	StartFrom string `json:"start_from"`
	EndAt     string `json:"end_at"`
	Type      string `json:"type"` // 'video' or 'audio'
}

type TimelineManifest struct {
	Segments []VideoSegment `json:"segments"`
}
