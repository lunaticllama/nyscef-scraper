from flask import Flask, render_template, send_from_directory

app = Flask(__name__)


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/static/bookmarklet.js')
def bookmarklet():
    response = send_from_directory('static', 'bookmarklet.js')
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Cache-Control'] = 'no-cache'
    return response


if __name__ == '__main__':
    app.run(debug=True)
