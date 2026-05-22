from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeout


class NyscefScraper:

    LOGIN_URL = 'https://iapps.courts.state.ny.us/nyscef/Login'
    TIMEOUT = 15000  # milliseconds

    def __init__(self, username, password):
        self.username = username
        self.password = password
        self._playwright = sync_playwright().start()
        self.browser = self._playwright.chromium.launch(headless=True)
        self.page = self.browser.new_page()

    def login(self):
        self.page.goto(self.LOGIN_URL)
        self.page.wait_for_selector('input[name="txtUserName"]', timeout=self.TIMEOUT)
        self.page.fill('input[name="txtUserName"]', self.username)
        self.page.fill('input[name="pwPassword"]', self.password)
        self.page.click('input[name="btnSubmit"]')

        try:
            self.page.wait_for_selector('a[href*="MyCases"]', timeout=self.TIMEOUT)
        except PlaywrightTimeout:
            raise ValueError("Login failed — check your NYSCEF username and password.")

    def navigate_to_case(self, index_number):
        self.page.click('a[href*="MyCases"]')

        try:
            self.page.wait_for_selector(f'text="{index_number}"', timeout=self.TIMEOUT)
        except PlaywrightTimeout:
            raise ValueError(f"Case '{index_number}' not found in My Cases.")

        self.page.click(f'text="{index_number}"')

        # Wait for the document table to appear
        # NOTE: verify this selector against the live NYSCEF site if scraping breaks
        try:
            self.page.wait_for_selector('table tr td', timeout=self.TIMEOUT)
        except PlaywrightTimeout:
            raise ValueError("Case page loaded but no document table was found.")

    def get_documents(self, index_number):
        self.login()
        self.navigate_to_case(index_number)
        return self._scrape_document_table()

    def _scrape_document_table(self):
        # NOTE: targets the first table with data rows on the case page.
        # Adjust the selector if the NYSCEF site structure changes.
        rows = self.page.query_selector_all('table tr:has(td)')
        documents = []
        for row in rows:
            cells = row.query_selector_all('td')
            if len(cells) < 4:
                continue
            documents.append({
                'number':     cells[0].inner_text().strip(),
                'title':      cells[1].inner_text().strip(),
                'type':       cells[2].inner_text().strip(),
                'filed_by':   cells[3].inner_text().strip(),
                'date_filed': cells[4].inner_text().strip() if len(cells) > 4 else '',
            })
        return documents

    def close(self):
        self.browser.close()
        self._playwright.stop()
