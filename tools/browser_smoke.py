from __future__ import annotations

import argparse

from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait


def main() -> int:
    parser = argparse.ArgumentParser(description="Run the Browser Judge smoke test.")
    parser.add_argument(
        "url",
        nargs="?",
        default="http://127.0.0.1:8080/tests/browser_smoke.html",
    )
    parser.add_argument(
        "--app-url",
        default="http://127.0.0.1:8080/frontend/?problem=101",
    )
    args = parser.parse_args()

    options = Options()
    options.add_argument("--headless=new")
    options.add_argument("--disable-gpu")
    options.add_argument("--no-first-run")
    options.add_argument("--no-default-browser-check")

    with webdriver.Chrome(options=options) as browser:
        browser.get(args.url)
        body = WebDriverWait(browser, 130).until(
            lambda driver: (
                element
                if (element := driver.find_element(By.TAG_NAME, "body")).get_attribute(
                    "data-status"
                )
                != "loading"
                else False
            )
        )
        status = body.get_attribute("data-status")
        print(f"worker_status={status}")
        print(body.text)
        if status != "passed":
            return 1

        browser.get(args.app_url)
        editor = WebDriverWait(browser, 15).until(
            lambda driver: driver.find_element(By.ID, "code-editor")
        )
        editor.clear()
        editor.send_keys('print("smoke")')
        browser.find_element(By.ID, "submit-button").click()
        result = WebDriverWait(browser, 130).until(
            lambda driver: (
                panel
                if not (panel := driver.find_element(By.ID, "result-panel")).get_attribute(
                    "hidden"
                )
                and "WA" in panel.text
                else False
            )
        )
        print("ui_status=passed")
        print(result.text.splitlines()[0])
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
