'use strict';
require('dotenv').config();
const express = require('express');
const morgan = require('morgan');
const cors = require('cors');
const helmet = require('helmet');
const { NODE_ENV } = require('./config');
const app = express();
const userRouter = require('./user/user-router');
const gamesRouter = require('./games/games-router');
const PartyRouter = require('./party/party-router');
const authRouter = require('./auth/auth-router');
const SpotRouter = require('./spots/spot-router');
const mailerRouter = require('./nodemailer/mailer-router');

const morganOption = NODE_ENV === 'production' ? 'tiny' : 'common';

const config = {pingTimeout: 60000};
const server = require('http').Server(app);
const io = require('socket.io')(server, config);

const ioService = require('./io-service');

function getIo() {
  return io;
}

ioService.setUpIo(io);

app.use(morgan(morganOption));
app.use(helmet());
app.use(cors());

app.use('/api/user', userRouter);
app.use('/api/parties', PartyRouter);
app.use('/api/games', gamesRouter);
app.use('/api/auth', authRouter);
app.use('/api/spot', SpotRouter);
app.use('/api/confirmation', mailerRouter);
app.use('/images', express.static('images'));

app.use(function errorHandler(error, req, res, next) {
  let response;
  if (NODE_ENV === 'production') {
    response = { error: { message: 'Server Error' } };
  } else {
    console.error(error);
    response = { message: error.message, error };
  }
  res.status(500).json(response);
});


module.exports = {
  server,
  app,
  getIo
};
