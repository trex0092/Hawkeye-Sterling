# Hawkeye Sterling — Java

```java
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;

public class HawkeyeClient {
    private static final String BASE = "https://hawkeye-sterling.netlify.app";
    private static final String KEY = System.getenv("HAWKEYE_API_KEY");

    private final HttpClient http = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(5))
            .build();

    public String screen(String name, String jurisdiction) throws Exception {
        String body = """
            { "subject": { "name": "%s", "jurisdiction": "%s" }, "candidates": [] }
            """.formatted(name, jurisdiction);
        HttpRequest req = HttpRequest.newBuilder()
                .uri(URI.create(BASE + "/api/quick-screen"))
                .header("Authorization", "Bearer " + KEY)
                .header("Content-Type", "application/json")
                .timeout(Duration.ofSeconds(10))
                .POST(HttpRequest.BodyPublishers.ofString(body))
                .build();
        HttpResponse<String> res = http.send(req, HttpResponse.BodyHandlers.ofString());
        if (res.statusCode() >= 400) {
            throw new RuntimeException("Hawkeye " + res.statusCode());
        }
        return res.body();
    }

    public static void main(String[] args) throws Exception {
        System.out.println(new HawkeyeClient().screen("Ivan Petrov", "RU"));
    }
}
```
