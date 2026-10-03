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

        list_url = args.app_url.split("?", 1)[0]
        browser.get(list_url)
        browser.find_element(By.ID, "tqc-catalog-button").click()
        units = WebDriverWait(browser, 15).until(
            lambda driver: (
                found
                if len(found := driver.find_elements(By.CLASS_NAME, "unit-card")) == 9
                else False
            )
        )
        units[0].click()
        items = WebDriverWait(browser, 15).until(
            lambda driver: (
                found
                if len(found := driver.find_elements(By.CLASS_NAME, "problem-list-item"))
                == 10
                else False
            )
        )
        if items[0].text.splitlines()[:2] != ["101", "整數格式化輸出"]:
            print(f"list_status=failed: {items[0].text!r}")
            return 1
        if "catalog=tqc" not in browser.current_url or "unit=1" not in browser.current_url:
            print(f"unit_route_status=failed: {browser.current_url}")
            return 1
        items[0].click()
        if "problem=101" not in browser.current_url:
            print(f"problem_route_status=failed: {browser.current_url}")
            return 1
        print("list_status=passed")

        editor = WebDriverWait(browser, 15).until(
            lambda driver: driver.find_element(By.CLASS_NAME, "CodeMirror")
        )
        browser.execute_script(
            'arguments[0].CodeMirror.setValue(\'print("smoke")\')', editor
        )
        highlighted_tokens = editor.find_elements(
            By.CSS_SELECTOR, ".cm-builtin, .cm-string"
        )
        if len(highlighted_tokens) < 2:
            print("syntax_status=failed")
            return 1
        print("syntax_status=passed")
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
