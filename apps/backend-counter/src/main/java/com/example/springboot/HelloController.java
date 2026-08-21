package com.example.springboot;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class HelloController {

    private final CounterService counterService;

    public HelloController(CounterService counterService) {
        this.counterService = counterService;
    }

    @GetMapping("/")
    public String index() {
        Long count = counterService.increment();
        return "Visitors count: " + count;
    }
}
