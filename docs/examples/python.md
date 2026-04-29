# Hawkeye Sterling — Python

```python
import os
import httpx

BASE = "https://hawkeye-sterling.netlify.app"
KEY = os.environ["HAWKEYE_API_KEY"]

def screen(name: str, jurisdiction: str = "") -> dict:
    r = httpx.post(
        f"{BASE}/api/quick-screen",
        headers={"Authorization": f"Bearer {KEY}"},
        json={
            "subject": {"name": name, "jurisdiction": jurisdiction},
            "candidates": [],
        },
        timeout=10.0,
    )
    r.raise_for_status()
    return r.json()

def super_brain(name: str, adverse_media_text: str = "") -> dict:
    r = httpx.post(
        f"{BASE}/api/super-brain",
        headers={"Authorization": f"Bearer {KEY}"},
        json={"subject": {"name": name}, "adverseMediaText": adverse_media_text},
        timeout=10.0,
    )
    r.raise_for_status()
    return r.json()

def news_search(q: str) -> dict:
    r = httpx.get(
        f"{BASE}/api/news-search",
        headers={"Authorization": f"Bearer {KEY}"},
        params={"q": q},
        timeout=10.0,
    )
    r.raise_for_status()
    return r.json()

def submit_feedback(subject_id: str, list_id: str, list_ref: str,
                    candidate_name: str, verdict: str, analyst: str) -> dict:
    r = httpx.post(
        f"{BASE}/api/feedback",
        headers={"Authorization": f"Bearer {KEY}"},
        json={
            "subjectId": subject_id,
            "listId": list_id,
            "listRef": list_ref,
            "candidateName": candidate_name,
            "verdict": verdict,  # false_positive | true_match | needs_review
            "analyst": analyst,
        },
    )
    r.raise_for_status()
    return r.json()

if __name__ == "__main__":
    result = screen("Ivan Petrov", "RU")
    print(f"Top score: {result['topScore']}  Severity: {result['severity']}")
    for hit in result.get("hits", []):
        print(f"  {hit['listId']} · {hit['candidateName']} ({hit['score']:.2f})")
```
