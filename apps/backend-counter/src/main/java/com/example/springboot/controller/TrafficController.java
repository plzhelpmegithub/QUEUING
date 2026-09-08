package com.example.springboot.controller;

import com.example.springboot.CounterService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/traffic")
public class TrafficController {

    private final CounterService counterService;

    public TrafficController(CounterService counterService) {
        this.counterService = counterService;
    }

    @PostMapping("/enter")
    public ResponseEntity<Map<String, Object>> enter(@RequestParam(defaultValue = "main") String page) {
        Long count = counterService.enterPage(page);
        return ResponseEntity.ok(Map.of(
                "page", page,
                "activeUsers", count,
                "congestionLevel", counterService.calculateLevel(count)
        ));
    }

    @PostMapping("/leave")
    public ResponseEntity<Map<String, Object>> leave(@RequestParam(defaultValue = "main") String page) {
        Long count = counterService.leavePage(page);
        return ResponseEntity.ok(Map.of(
                "page", page,
                "activeUsers", count,
                "congestionLevel", counterService.calculateLevel(count)
        ));
    }

    @GetMapping("/status")
    public ResponseEntity<Map<String, Object>> status(@RequestParam(defaultValue = "main") String page) {
        Long count = counterService.getPageCount(page);
        return ResponseEntity.ok(Map.of(
                "page", page,
                "activeUsers", count,
                "congestionLevel", counterService.calculateLevel(count)
        ));
    }
}
