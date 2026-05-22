import sys
import re

from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys

import time
from datetime import datetime

class nyscef_session:

    login_url = 'https://iapps.courts.state.ny.us/nyscef/Login'

    def __init__ (self, file, index):

        self.index = index

        with open (file) as f:
            contents=f.read()

        usr = re.search(r'User:(\w+)', contents)
        pwd = re.search(r'Pass:([\w!]+)', contents)

        if usr:
            self.user = usr.group(1)
        else:
            print ("No NYSCEF username found...")
            sys.exit()

        if pwd:
            self.password = pwd.group(1)
        else:
            print ("No NYSCEF password found...")
            sys.exit()

        print ("NYSCEF Username:", user)
        print ("Index No.:", index)
        print ("Read NYSCEF credentials!")

    def login_find_case (self, webdriver):

        driver = webdriver
        driver.get(self.login_url)
        time.sleep(3)

        print("Logging into NYSCEF...")

        driver.find_element(By.XPATH, "//input[@name='txtUserName']").send_keys(self.user)
        driver.find_element(By.XPATH, "//input[@name='pwPassword']").send_keys(self.password)
        driver.find_element(By.XPATH, "//input[@name='btnSubmit']").click()
        driver.find_element(By.XPATH, "//a[@href='MyCases']").click()

        print("Located My Cases / Appeals")
        print("Locating Index No.", self.index)

        case = driver.find_element_by_link_text(self.index).click()
        print("Index No.", self.index, "located!")

    def screenshot (self):

        screenshot_filename = datetime.now().strftime("%Y%m%d-%H%M%S.png")
        driver.save_screenshot(screenshot_filename)
