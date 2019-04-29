const express = require('express');
const PartyService = require('../party/party-service');
const SpotService = require('../spots/spot-service');
const {requireAuth} = require('../middleware/jwt-auth');
const bodyParser = express.json();
const SpotRouter = express.Router();

const ioService = require('../io-service');

SpotRouter
  .patch("/:spotId", requireAuth, bodyParser, async (req, res, next) => {
    const { spotId } = req.params;
    const { game_id, party_id } = req.body;
    console.log(game_id, party_id);
    const db = req.app.get('db');
    try {
      const spot = await SpotService.getSpotById(db, spotId);
      if (spot.filled) {
        return res.json({ error: 'Spot is already taken' });
      }

      const party = await PartyService.getSimplePartyById(db, spot.party_id);
      const promises = [await SpotService.updateSpot(db, spotId, { filled: req.user.id })];

      if (party.spots_left < 2) {
        promises.push(await PartyService.updateParty(db, party_id, { filled: true }));
      }

      await Promise.all(promises);

      res.sendStatus(204);
      ioService.emitRoomEvent('update parties', `/games/${game_id}`);
      ioService.emitRoomEvent('update party', `/party/${party_id}`);
      next();
    } catch (error) {
      next(error);
    }
  });
  

module.exports = SpotRouter;