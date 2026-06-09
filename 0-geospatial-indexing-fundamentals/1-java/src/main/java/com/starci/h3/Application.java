package com.starci.h3;

import com.uber.h3core.H3Core;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.annotation.Bean;

import java.io.IOException;

@SpringBootApplication
public class Application {

    public static void main(String[] args) {
        SpringApplication.run(Application.class, args);
    }

    // One shared, thread-safe H3Core instance for the whole app.
    // H3Core is immutable after construction, so a singleton bean is safe.
    @Bean
    public H3Core h3Core() throws IOException {
        return H3Core.newInstance();
    }
}
