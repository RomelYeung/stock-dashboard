import asyncio
import json
import re
from crawl4ai import AsyncWebCrawler
from datetime import datetime

async def main():
    try:
        async with AsyncWebCrawler(verbose=False) as crawler:
            result = await crawler.arun(url="https://www.aaii.com/sentimentsurvey/sent_results")
            
            lines = result.markdown.splitlines()
            history = []
            
            in_table = False
            for line in lines:
                if "| Reported Date" in line:
                    in_table = True
                    continue
                if in_table and "| ---" in line:
                    continue
                if in_table:
                    if "|" not in line or line.strip() == "" or "Take the Sentiment Survey" in line:
                        in_table = False
                        break
                    
                    parts = [p.strip() for p in line.split("|") if p.strip()]
                    if len(parts) >= 4:
                        date_str = parts[0]
                        bullish_str = parts[1].replace("%", "")
                        neutral_str = parts[2].replace("%", "")
                        bearish_str = parts[3].replace("%", "")
                        
                        try:
                            # Assume current year for these dates. Note: near Jan/Dec boundary this might need smarter logic,
                            # but let's just parse the date string as is and maybe append current year.
                            # For dashboard chart, the exact year might be tricky if it spans multiple years.
                            # Wait, AAII usually provides recent history. Let's just use the string or parse it.
                            date_parsed = datetime.strptime(f"{date_str} {datetime.now().year}", "%b %d %Y")
                            # If date is in future, it was from last year
                            if date_parsed > datetime.now():
                                date_parsed = datetime.strptime(f"{date_str} {datetime.now().year - 1}", "%b %d %Y")
                                
                            history.append({
                                "date": date_parsed.strftime("%Y-%m-%d"),
                                "bullish": float(bullish_str),
                                "neutral": float(neutral_str),
                                "bearish": float(bearish_str),
                                # Spread is Bullish - Bearish
                                "spread": float(bullish_str) - float(bearish_str)
                            })
                        except Exception as e:
                            pass # Ignore parse errors for specific rows
                            
            # Sort history oldest to newest
            history.sort(key=lambda x: x["date"])
            
            if history:
                output = {
                    "currentValue": history[-1]["spread"], # Using spread as the primary value
                    "currentBullish": history[-1]["bullish"],
                    "currentBearish": history[-1]["bearish"],
                    "history": history
                }
                print(json.dumps(output))
            else:
                print(json.dumps({"error": "No data parsed"}))
                
    except Exception as e:
        print(json.dumps({"error": str(e)}))

if __name__ == "__main__":
    asyncio.run(main())
