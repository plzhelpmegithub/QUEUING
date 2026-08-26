package com.example.springboot.controller;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.client.RestTemplate;

@RestController
@RequestMapping("/api/monitor")
public class MonitorController {

    private final RestTemplate restTemplate = new RestTemplate();

    @GetMapping("/health")
    public ResponseEntity<String> checkPrometheusHealth() {
        String prometheusHealthUrl = "http://localhost:9090/-/healthy"; 

        try {
            ResponseEntity<String> response = restTemplate.getForEntity(prometheusHealthUrl, String.class);
            if (response.getStatusCode().is2xxSuccessful()) {
                return ResponseEntity.ok("UP");
            }
        } catch (Exception e) {
            return ResponseEntity.ok("DOWN");
        }

        return ResponseEntity.ok("DOWN");
    }
}
