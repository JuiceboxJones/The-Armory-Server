const xss = require('xss');
const Treeize = require('treeize');
const UserService = require('../user/user-service');
const GamesService = require('../games/games-service');
const REQUIREMENT_STORE = require('../store/requirements');
const ROLES_STORE = require('../store/roles');
const GAMEMODE_STORE = require('../store/gamemodes');

const config = require('../config');
const {PARTY_DISPLAY_LIMIT} = config;

const PartyService = {
  getPartyById(db, partyId) {
    return db
      .from("party AS p")
      .select(
        'p.id',
        'p.game_id',
        'p.title',
        'p.owner_id',
        'p.description',
        'p.require_app',
        'p.gamemode',
        'pr.requirement_id AS reqs:id',
        's.id AS spots:id',
        's.filled AS spots:filled',
        'sr.role_id AS spots:roles:id'
      )
      .leftJoin("spots AS s", "p.id", "s.party_id")
      .leftJoin("party_requirements AS pr", "pr.party_id", "p.id")
      .leftJoin("spot_roles AS sr", "sr.spot_id", "s.id")
      .where("p.id", partyId);
  },
  getSimplePartyById: async function(db, partyId) {
    const data = await db.raw(`select p.*, 
        (select count(*) filter (where filled is null) as spots_left from spots where spots.party_id='${partyId}') 
        from party as p where p.id = '${partyId}'`);
    return data.rows[0];
  },
  serializeParty: async function(db, party_data) {
    const tree = new Treeize().setOptions({ output: { prune: false } }); //prevents removal of 'null'

    party_data = await Promise.all(party_data.map(async party => {
      if (party['spots:filled']) {
        const { username, avatar_url } = await UserService.getUserInfo(db, party['spots:filled']); //Get this from Will

        party['spots:filled'] = {
          username: xss(username),
          avatar_url
        };
      }
      return party;
    }));

    tree.grow(party_data);
    const [partyResponse] = tree.getData();

    const gameId = partyResponse.game_id;

    partyResponse.gamemode = GAMEMODE_STORE[gameId][partyResponse.gamemode];
    partyResponse.spots = this.mapRoles(partyResponse.spots, gameId);
    partyResponse.reqs = this.mapReqs(partyResponse.reqs, gameId);
    
    return {
      ...partyResponse,
      title: xss(partyResponse.title),
      description: xss(partyResponse.description)
    };
  },
  serializeGamePageParty: async (db, party) => {
    const tree = new Treeize().setOptions({ output: { prune: false }}); //prevents removal of 'null'
    tree.grow(party);
    const [partyResponse] = tree.getData();
    const gameId = partyResponse.game_id;
    delete partyResponse.game_id;

    const user = await UserService.getUserInfo(db, partyResponse.owner_id);
    partyResponse.owner_id = {
      ...user,
      username: xss(user.username)
    };

    partyResponse.gamemode = GAMEMODE_STORE[gameId][partyResponse.gamemode];
    partyResponse.spots = PartyService.mapRoles(partyResponse.spots, gameId);
    partyResponse.reqs = PartyService.mapReqs(partyResponse.reqs, gameId);

    const [partyCount] = await GamesService.getPartyCount(db, gameId);
    // const pages_available = await GamesService.getPartyCount

    return {
      game_id: gameId,
      pages_available: Math.ceil(partyCount.count/PARTY_DISPLAY_LIMIT),
      party: {
        ...partyResponse,
        title: xss(partyResponse.title),
        description: xss(partyResponse.description)
      },
    };
  },
  mapRoles(spots, gameId) {
    return spots.map(spot => {
      return {
        ...spot,
        roles: spot.roles.map(role => {
          return {
            ...ROLES_STORE[gameId][role.id] || null
          };
        })
      };
    });
  },
  mapReqs(reqs, gameId) {
    return reqs.map(req => {
      return {
        ...REQUIREMENT_STORE[gameId][req.id]
      };
    });
  },
  insertParty(db, newParty) {
    return db
      .insert(newParty)
      .into("party")
      .returning("id")
      .then(([party]) => party);
  },
  deleteParty(db, partyId) {
    return db
      .from("party")
      .where("id", partyId)
      .del();
  },
  setReady(db, party_id) {
    return db("party")
      .where("id", party_id)
      .update({ ready: true });
  },

  getOwnerId(db, party_id) {
    return db
      .from("party")
      .where("id", party_id)
      .select("owner_id")
      .first();
  },
  updateParty(db, party_id, newParty) {
    return db("party")
      .where("id", party_id)
      .update(newParty);
  },
  insertMessage(db, message) {
    return db
      .insert(message)
      .into("party_messages")
      .returning("id")
      .then(([message]) => message);
  },
  getPartyMessages(db, partyId) {
    return db
      .from("party_messages AS pm")
      .select(
        "pm.id",
        "pm.party_id",
        "pm.message_body",
        "pm.time_created",
        "pm.edited",
        "u.id AS user_id",
        "u.username",
        "u.email",
        "u.avatar_url"
        )
        .leftJoin("users AS u", "u.id", "pm.owner_id")
        .where("pm.party_id", partyId)
        .orderBy('unix_stamp', 'asc');
  },
  updateChatMessage(db, id, newMessage){
    return db('party_messages')
      .where('id', id)
      .update(newMessage);
  },
  deleteChatMessage(db, id){
    return db('party_messages')
      .where('id', id)
      .del();
  }, 
  insertIntoArchive(db, message){
    return db
      .insert(message)
      .into('archived_messages')
      .returning("id")
      .then(([message]) => message);
  },
  deletePartyChatLogs(db, partyId){
    return db('party_messages')
      .where('party_id', partyId)
      .del();
  },
  confirmPartyMember(db, id, partyId ){
    return db
    .from('spots')
    .where('party_id', partyId)
    .andWhere('filled', id)
    .first()
  }
};

module.exports = PartyService;
