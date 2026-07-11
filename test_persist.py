from playwright.sync_api import sync_playwright

URL = "http://127.0.0.1:8766/index.html?session=test-week"
XLSX = r"d:\Down\주말공사.xlsx"

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 390, "height": 844})
    page.goto(URL, wait_until="networkidle")
    page.wait_for_timeout(2000)
    assert page.get_by_text("엑셀/CSV 선택").count() > 0
    page.locator("#excel-upload").set_input_files(XLSX)
    page.wait_for_timeout(1500)
    assert "58" in page.inner_text("body")
    page.locator("div").filter(has_text="NO.1").first.click()
    page.wait_for_timeout(400)
    page.locator("input[placeholder*='2G11']").fill("2G11")
    page.get_by_role("button", name="김숙자").first.click()
    page.locator("textarea").fill("테스트 메모")
    page.get_by_role("button", name="입력 완료").click()
    page.wait_for_timeout(1000)
    body = page.inner_text("body")
    assert "2G11" in body
    assert "테스트 메모" in body
    page.reload(wait_until="networkidle")
    page.wait_for_timeout(2500)
    body = page.inner_text("body")
    assert "2G11" in body, "reload lost spotLocation"
    assert "테스트 메모" in body, "reload lost memo"
    print("PASS: persistence after reload OK")
    browser.close()
