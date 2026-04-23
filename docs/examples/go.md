# Hawkeye Sterling — Go

```go
package main

import (
    "bytes"
    "encoding/json"
    "fmt"
    "io"
    "net/http"
    "os"
    "time"
)

const base = "https://hawkeye-sterling.netlify.app"

type subject struct {
    Name         string `json:"name"`
    Jurisdiction string `json:"jurisdiction,omitempty"`
}

type screenRequest struct {
    Subject    subject `json:"subject"`
    Candidates []any   `json:"candidates"`
}

func screen(client *http.Client, name, jurisdiction string) (map[string]any, error) {
    body, _ := json.Marshal(screenRequest{
        Subject:    subject{Name: name, Jurisdiction: jurisdiction},
        Candidates: []any{},
    })
    req, _ := http.NewRequest("POST", base+"/api/quick-screen", bytes.NewReader(body))
    req.Header.Set("Authorization", "Bearer "+os.Getenv("HAWKEYE_API_KEY"))
    req.Header.Set("Content-Type", "application/json")

    res, err := client.Do(req)
    if err != nil {
        return nil, err
    }
    defer res.Body.Close()

    raw, _ := io.ReadAll(res.Body)
    if res.StatusCode >= 400 {
        return nil, fmt.Errorf("hawkeye %d: %s", res.StatusCode, raw)
    }
    var out map[string]any
    if err := json.Unmarshal(raw, &out); err != nil {
        return nil, err
    }
    return out, nil
}

func main() {
    client := &http.Client{Timeout: 10 * time.Second}
    out, err := screen(client, "Ivan Petrov", "RU")
    if err != nil {
        panic(err)
    }
    fmt.Printf("Severity: %v  Top score: %v\n", out["severity"], out["topScore"])
}
```
