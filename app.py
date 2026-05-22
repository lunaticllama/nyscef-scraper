import logging
from flask import Flask, render_template, request
from scraper import NyscefScraper

logging.basicConfig(level=logging.INFO)
app = Flask(__name__)


@app.route('/', methods=['GET'])
def index():
    return render_template('index.html')


@app.route('/scrape', methods=['POST'])
def scrape():
    username = request.form.get('username', '').strip()
    password = request.form.get('password', '').strip()
    index_number = request.form.get('index_number', '').strip()

    if not username or not password or not index_number:
        return render_template('index.html', error="All fields are required.")

    scraper = None
    try:
        scraper = NyscefScraper(username, password)
        documents = scraper.get_documents(index_number)
    except ValueError as e:
        msg = str(e)
        if msg.startswith('LOGIN_PAGE_NOT_FOUND|'):
            _, url, screenshot = msg.split('|', 2)
            return render_template('index.html',
                                   error=f"Could not find login form. Page URL: {url}",
                                   screenshot=screenshot)
        return render_template('index.html', error=msg)
    except Exception as e:
        app.logger.exception("Scrape failed")
        return render_template('index.html', error=f"Error: {e}")
    finally:
        if scraper:
            scraper.close()

    return render_template('results.html', documents=documents, index_number=index_number)


if __name__ == '__main__':
    app.run(debug=True)
