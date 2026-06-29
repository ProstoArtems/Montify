package com.montify.api.dto.request;

public class RenderSegmentDto {
    private String fileKey;
    private int start;
    private int end;
    private String type; // 'video' or 'audio'

    public String getFileKey() { return fileKey; }
    public void setFileKey(String fileKey) { this.fileKey = fileKey; }

    public int getStart() { return start; }
    public void setStart(int start) { this.start = start; }

    public int getEnd() { return end; }
    public void setEnd(int end) { this.end = end; }

    public String getType() { return type; }
    public void setType(String type) { this.type = type; }
}