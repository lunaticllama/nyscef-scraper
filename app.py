from flask import Flask, render_template, request
from scraper import NyscefScraper

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

    scraper = NyscefScraper(username, password)
    try:
        documents = scraper.get_documents(index_number)
    except ValueError as e:
        return render_template('index.html', error=str(e))
    except Exception:
        return render_template('index.html', error="An unexpected error occurred. Please try again.")
    finally:
        scraper.close()

    return render_template('results.html', documents=documents, index_number=index_number)


if __name__ == '__main__':
    app.run(debug=True)
