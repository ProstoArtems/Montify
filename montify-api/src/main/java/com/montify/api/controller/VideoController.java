package com.montify.api.controller;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api/v1/videos")
public class VideoController {

    @GetMapping("/status")
    public Map<String, String> getStatus() {
        return Map.of(
                "status", "OK",
                "service", "Montify API"
        );
    }
}