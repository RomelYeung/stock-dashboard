import asyncio
from crawl4ai import AsyncWebCrawler

async def main():
    async with AsyncWebCrawler(verbose=True) as crawler:
        result = await crawler.arun(url="https://www.aaii.com/sentimentsurvey/sent_results", magic=True)
        with open("debug_aaii.md", "w") as f:
            f.write(result.markdown)
        print("Done")

if __name__ == "__main__":
    asyncio.run(main())
