package com.montify.api.dto;

import lombok.Data;
import java.util.List;

@Data
public class RenderManifestDto {
    private List<RenderSegmentDto> segments;
}