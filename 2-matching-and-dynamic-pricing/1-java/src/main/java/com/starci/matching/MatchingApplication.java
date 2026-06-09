package com.starci.matching;

import com.uber.h3core.H3Core;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.annotation.Bean;

import java.io.IOException;

@SpringBootApplication
public class MatchingApplication {

    public static void main(String[] args) {
        SpringApplication.run(MatchingApplication.class, args);
    }

    @Bean
    public H3Core h3Core() throws IOException {
        return H3Core.newInstance();
    }
}
