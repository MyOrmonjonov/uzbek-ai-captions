package org.example.plugin;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;

@SpringBootApplication
@ConfigurationPropertiesScan
public class PluginApplication {

    public static void main(String[] args) {
        SpringApplication.run(PluginApplication.class, args);
    }

}
