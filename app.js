const express = require('express');
const bodyParser = require('body-parser');
const createError = require('http-errors');
const cookieParser = require('cookie-parser');
const logger = require('morgan');
const cors = require('cors');

const app = express();
app.use(logger('dev'));
app.use(bodyParser.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(cors({ origin: 'http://localhost:4200' }));

app.listen(3000, () => {
  console.log('Server started at port: 3000');
});

app.use('/', require('./routes/index'));

app.all('/**', (req, res) => {
  res.writeHead(404,'Route not found.');
  res.end();
});

app.use((req, res, next) => {
  next(createError(404));
});

app.use((err, req, res, next) => {
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};
  res.status(err.status || 500);
});