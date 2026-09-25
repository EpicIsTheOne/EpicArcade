import json
import re
from pathlib import Path

root = Path(__file__).resolve().parents[1]
index = (root / "index.html").read_text(encoding="utf-8")
app = (root / "app.js").read_text(encoding="utf-8")
score = json.loads((root / "music" / "score.json").read_text(encoding="utf-8"))
analysis = json.loads((root / "music" / "analysis.json").read_text(encoding="utf-8"))
assert "id=\"stage\"" in index
assert "Glasslight_Requiem_preview.mp3" in index
assert "Glasslight_Requiem_preview.mp3" in app
assert score["duration"] == analysis["duration"] or abs(score["duration"] - analysis["duration"]) < 0.1
assert score["sections"][0]["start"] == 0
assert score["sections"][-1]["end"] <= score["duration"]
assert all(score["sections"][index]["end"] <= score["sections"][index + 1]["start"] for index in range(len(score["sections"]) - 1))
assert all((root / path).exists() for path in ["music/Glasslight_Requiem.mp3", "music/Glasslight_Requiem.wav", "music/Glasslight_Requiem_preview.mp3", "music/score.json", "music/analysis.json", "README.md", "arcade.json"])
print(json.dumps({"scoreDuration": score["duration"], "analysisDuration": analysis["duration"], "sections": len(score["sections"]), "events": len(score["events"]), "onsets": len(analysis["onsetTimes"]), "peak": analysis["peak"]}))