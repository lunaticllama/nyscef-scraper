import os
from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC


class NyscefScraper:

    LOGIN_URL = 'https://iapps.courts.state.ny.us/nyscef/Login'
    TIMEOUT = 15

    def __init__(self, username, password):
        self.username = username
        self.password = password
        self.driver = self._create_driver()

    def _create_driver(self):
        options = webdriver.ChromeOptions()
        options.add_argument('--headless=new')
        options.add_argument('--no-sandbox')
        options.add_argument('--disable-setuid-sandbox')
        options.add_argument('--disable-dev-shm-usage')
        options.add_argument('--disable-gpu')
        options.add_argument('--disable-extensions')
        options.add_argument('--window-size=1920,1080')

        if os.environ.get('RENDER'):
            # On Render.com, use system-installed Chromium
            options.binary_location = '/usr/bin/chromium'
            service = Service('/usr/bin/chromedriver')
        else:
            from webdriver_manager.chrome import ChromeDriverManager
            service = Service(ChromeDriverManager().install())

        return webdriver.Chrome(service=service, options=options)

    def _wait(self):
        return WebDriverWait(self.driver, self.TIMEOUT)

    def login(self):
        self.driver.get(self.LOGIN_URL)
        wait = self._wait()

        wait.until(EC.presence_of_element_located((By.NAME, 'txtUserName')))
        self.driver.find_element(By.NAME, 'txtUserName').send_keys(self.username)
        self.driver.find_element(By.NAME, 'pwPassword').send_keys(self.password)
        self.driver.find_element(By.NAME, 'btnSubmit').click()

        # Wait for My Cases link — confirms login succeeded
        try:
            wait.until(EC.presence_of_element_located((By.XPATH, "//a[contains(@href,'MyCases')]")))
        except Exception:
            raise ValueError("Login failed — check your NYSCEF username and password.")

    def navigate_to_case(self, index_number):
        self.driver.find_element(By.XPATH, "//a[contains(@href,'MyCases')]").click()
        wait = self._wait()

        try:
            wait.until(EC.presence_of_element_located((By.LINK_TEXT, index_number)))
        except Exception:
            raise ValueError(f"Case '{index_number}' not found in My Cases.")

        self.driver.find_element(By.LINK_TEXT, index_number).click()

        # Wait for the document list table to appear
        # NOTE: verify this XPath against the live NYSCEF site if scraping breaks
        wait.until(EC.presence_of_element_located((By.XPATH, "//table[.//tr[td]]")))

    def get_documents(self, index_number):
        self.login()
        self.navigate_to_case(index_number)
        return self._scrape_document_table()

    def _scrape_document_table(self):
        # NOTE: NYSCEF renders documents in an HTML table. These selectors target
        # the first table with data rows. Adjust the XPath if the site structure changes.
        rows = self.driver.find_elements(By.XPATH, "//table[.//tr[td]]//tr[td]")

        documents = []
        for row in rows:
            cells = row.find_elements(By.TAG_NAME, 'td')
            if len(cells) < 4:
                continue
            documents.append({
                'number':    cells[0].text.strip(),
                'title':     cells[1].text.strip(),
                'type':      cells[2].text.strip(),
                'filed_by':  cells[3].text.strip(),
                'date_filed': cells[4].text.strip() if len(cells) > 4 else '',
            })

        return documents

    def close(self):
        if self.driver:
            self.driver.quit()
