const express = require('express');
const bodyParser = require('body-parser');
const router = express.Router();
const loads = require('./loads');
const { expressjwt: jwt } = require('express-jwt');
const jwksRsa = require('jwks-rsa');

const gds = require('./datastore');
const datastore = gds.datastore;

const BOATS = "Boats";
const LOADS = "Loads";

router.use(bodyParser.json());

const checkJwt = jwt({
    secret: jwksRsa.expressJwtSecret({
        //credentialsRequired: false,
        cache: true,
        rateLimit: true,
        jwksRequestsPerMinute: 5,
        jwksUri: `https://www.googleapis.com/oauth2/v3/certs`
    }),

    // Validate the audience and the issuer.
    issuer: `https://accounts.google.com`,
    algorithms: ['RS256']
});

function check_null_undefined(item) {
    let invalid = false;

    if (item.name === null || item.name === undefined) {
        invalid = true;
    }

    if (item.type === null || item.type === undefined) {
        invalid = true;
    }

    if (item.length === null || item.length === undefined) {
        invalid = true;
    }

    return invalid;
}

/* ------------- Begin Lodging Model Functions ------------- */
function addSelfLinkBoat(item, url, type) {
    if (item.loads.length !== 0) {
        for (let x in item.loads) {
            selfurl = url + "/" + type + "/" + item.loads[x].id;
            item.loads[x].self = selfurl
        }
    }
    return item;
}


function getBoats(req) {
    let q = datastore.createQuery(BOATS).limit(5);
    const results = {};
    let prev;

    if (Object.keys(req.query).includes("cursor")) {
        prev = req.protocol + "://" + req.get("host") + req.baseUrl + "?cursor=" + req.query.cursor;
        q = q.start(req.query.cursor);
    }
    return datastore.runQuery(q).then((entities) => {
        let temp = entities[0].map(gds.fromDatastore)
        results.count = temp.length;
        results.boats = entities[0].map(gds.fromDatastore).filter(item => item.owner === req.auth.sub);
        if (typeof prev !== 'undefined') {
            results.previous = prev;
        }
        if (entities[1].moreResults !== gds.Datastore.NO_MORE_RESULTS) {
            results.next = req.protocol + "://" + req.get("host") + req.baseUrl + "?cursor=" + entities[1].endCursor;
        }
        return results;
    });
}

function createBoat(name, type, length, owner) {
    let key = datastore.key(BOATS);
    const new_boat = { "name": name, "type": type, "length": length, "loads": [], "owner": owner };
    return datastore.save({ "key": key, "data": new_boat }).then(() => { return key });
}

function getBoat(id) {
    const key = datastore.key([BOATS, parseInt(id, 10)]);
    return datastore.get(key).then((entity) => {
        if (entity[0] === undefined || entity[0] === null) {
            return entity;
        } else {
            return entity.map(gds.fromDatastore);
        }
    });
}


function patchBoat(id, name, type, length, loads, owner) {
    const key = datastore.key([BOATS, parseInt(id, 10)]);
    const boat = { "name": name, "type": type, "length": length, "loads": loads, "owner": owner };
    return datastore.update({ "key": key, "data": boat }).then(() => { return key });
}


function deleteBoat(id) {
    const key = datastore.key([BOATS, parseInt(id, 10)]);
    return datastore.delete(key);
}

/* ------------- End Model Functions ------------- */

/* ------------- Begin Controller Functions ------------- */
router.get('/', checkJwt, function (req, res) {
    const accepts = req.accepts(['application/json']);
    if (!accepts) {
        return res.status(406).send('{"Error": "Not acceptable, response is in application/json only."}');
    } else if (accepts === 'application/json') {
        const boats = getBoats(req)
            .then((boat) => {
                for (let x in boat.boats) {
                    self_url = req.protocol + "://" + req.get("host");
                    boat.boats[x].self = self_url + req.baseUrl + "/" + boat.boats[x].id;
                    boat.boats[x] = addSelfLinkBoat(boat.boats[x], self_url, "loads");
                }
                return res.status(200).send(boat);
            });
    }
});

router.post('/', checkJwt, function (req, res) {
    if (req.get('content-type') !== 'application/json') {
        res.status(415).send('{"Error": "Server only accepts application/json data."}')
    }

    const accepts = req.accepts(['application/json']);
    if (!accepts) {
        return res.status(406).send('{"Error": "Not acceptable, response is in application/json only."}');
    } else if (accepts === 'application/json') {
        if (req.body.name == null || req.body.type == null || req.body.length == null) {
            res.status(400).send('{"Error": "The request object is missing at least one of the required attributes"}')
        }
        else {
            createBoat(req.body.name, req.body.type, req.body.length, req.auth.sub)
                .then(key => {
                    selfurl = req.protocol + "://" + req.get("host") + req.baseUrl + "/" + key.id;
                    return res.status(201).send('{ "id": ' + key.id + ', "name": "' + req.body.name + '", "type": "' + req.body.type + '", "length": '
                        + req.body.length + ', "owner": "' + req.auth.sub + '", "loads": []' + ', "self": "' + selfurl + '" }')
                });
        }
    }

});

router.patch('/:boat_id', checkJwt, function (req, res) {
    if (req.get('content-type') !== 'application/json') {
        res.status(415).send('{"Error": "Server only accepts application/json data."}')
    }

    const accepts = req.accepts(['application/json']);
    if (!accepts) {
        return res.status(406).send('{"Error": "Not acceptable, response is in application/json only."}');
    } else if (accepts === 'application/json') {
        const boatExists = getBoat(req.params.boat_id)
            .then(boat => {
                if (boat[0] == undefined || boat[0] == null) {
                    return res.status(404).json({ 'Error': 'No boat with this boat_id exists' });
                } else {
                    return boat[0];
                }
            });

        Promise.all([boatExists])
            .then(data => {
                const boat = data[0];
                console.log(boat);

                if (boat.owner !== req.auth.sub) {
                    return res.status(403).send('{"Error": "Unathorized access denied, boat doesn\'t belong to user."}')
                } else {
                    let name = (req.body.name === undefined) ? boat.name : req.body.name;
                    let type = (req.body.type === undefined) ? boat.type : req.body.type;
                    let length = (req.body.length === undefined) ? boat.length : req.body.length;
                    let load = boat.loads;

                    let owner = boat.owner;

                    patchBoat(req.params.boat_id, name, type, length, load, owner)
                        .then(key => getBoat(key.id))
                        .then(updatedBoat => {
                            updatedBoat[0].self = req.protocol + "://" + req.get("host") + req.baseUrl + "/" + updatedBoat[0].id;
                            return res.status(200).send(updatedBoat[0]);
                        });
                }
            });
    }
});

router.put('/:boat_id', checkJwt, function (req, res) {
    if (req.get('content-type') !== 'application/json') {
        res.status(415).send('{"Error": "Server only accepts application/json data."}')
    }

    const accepts = req.accepts(['application/json']);
    if (!accepts) {
        return res.status(406).send('{"Error": "Not acceptable, response is in application/json only."}');
    } else if (accepts === 'application/json') {
        if (check_null_undefined(req.body)) {
            res.status(400).send('{"Error": "The request object is missing at least one of the required attributes"}')
        }

        const boatExists = getBoat(req.params.boat_id)
            .then(boat => {
                if (boat[0] == undefined || boat[0] == null) {
                    return res.status(404).json({ 'Error': 'No boat with this boat_id exists' });
                } else {
                    return boat[0];
                }
            });

        Promise.all([boatExists])
            .then(data => {
                let boat = data[0];

                if (boat.owner !== req.auth.sub) {
                    return res.status(403).send('{"Error": "Unathorized access denied, boat doesn\'t belong to user."}')
                } else {
                    let name = (req.body.name === undefined) ? boat.name : req.body.name;
                    let type = (req.body.type === undefined) ? boat.type : req.body.type;
                    let length = (req.body.length === undefined) ? boat.length : req.body.length;
                    let load = boat.loads;
                    let owner = boat.owner;

                    patchBoat(req.params.boat_id, name, type, length, load, owner)
                        .then(key => getBoat(key.id))
                        .then(updatedBoat => {
                            updatedBoat[0].self = req.protocol + "://" + req.get("host") + req.baseUrl + "/" + updatedBoat[0].id;
                            return res.status(200).send(updatedBoat[0]);
                        });
                }
            });
    }

});

router.get('/:boat_id', function (req, res) {
    getBoat(req.params.boat_id)
        .then(boat => {
            if (boat[0] === undefined || boat[0] === null) {
                res.status(404).json({ 'Error': 'No boat with this boat_id exists' });
            } else {
                self_url = req.protocol + "://" + req.get("host");
                let item = addSelfLinkBoat(boat[0], self_url, "loads")
                item.self = self_url + req.baseUrl + "/" + boat[0].id;
                res.status(200).json(boat[0]);
            }
        });
});

router.put('/:boat_id/loads/:load_id', function (req, res) {
    const boatExists = getBoat(req.params.boat_id)
    const loadExists = loads.getLoad(req.params.load_id)

    Promise.all([loadExists, boatExists])
        .then(data => {
            let existsLoad = data[0][0];
            let existsBoat = data[1][0];

            if (existsBoat === undefined || existsBoat === null || existsLoad === undefined || existsLoad === null) {
                return res.status(404).json({ 'Error': 'The specified boat and/or load does not exist' });
            } else if (existsLoad.carrier != null) {
                if (existsLoad.carrier.id == req.params.boat_id) {
                    return res.status(403).json({ 'Error': 'The load is already loaded on another boat' });
                }
            }

            const results = { "id": parseInt(req.params.boat_id, 10), "name": existsBoat.name };
            loads.patchLoad(existsLoad.id, existsLoad.volume, existsLoad.item, existsLoad.creation_date, results)

            let loadItems = existsBoat.loads;
            loadItems.push({ "id": parseInt(req.params.load_id, 10) });

            return patchBoat(existsBoat.id, existsBoat.name, existsBoat.type, existsBoat.length, loadItems, existsBoat.owner)
                .then(() => { return res.status(204).send() });

        });
});

router.delete('/:boat_id/loads/:load_id', function (req, res) {
    const boatExists = getBoat(req.params.boat_id)
    const loadExists = loads.getLoad(req.params.load_id)

    Promise.all([loadExists, boatExists])
        .then(data => {
            let existsLoad = data[0][0];
            let existsBoat = data[1][0];

            if (existsBoat === undefined || existsBoat === null || existsLoad === undefined || existsLoad === null) {
                return res.status(404).json({ 'Error': 'No boat with this boat_id is loaded with the load with this load_id' });
            } else if (existsLoad.carrier != null) {
                if (existsLoad.carrier.id === existsBoat.id) {
                    const results = null;
                    loads.patchLoad(existsLoad.id, existsLoad.volume, existsLoad.item, existsLoad.creation_date, results)
                        .then(() => {
                            let loadItems = existsBoat.loads.filter(item => { return item.id !== existsLoad.id });
                            return patchBoat(existsBoat.id, existsBoat.name, existsBoat.type, existsBoat.length, loadItems, existsBoat.owner)
                                .then(() => { return res.status(204).send() });
                        });
                } else {
                    return res.status(404).json({ 'Error': 'No boat with this boat_id is loaded with the load with this load_id' });
                }
            } else {
                return res.status(404).json({ 'Error': 'No boat with this boat_id is loaded with the load with this load_id' });
            }
        });
});

router.delete('/:boat_id', checkJwt, function (req, res) {
    const boatExists = getBoat(req.params.boat_id)

    Promise.all([boatExists])
        .then(data => {
            let existsBoat = data[0][0];

            if (existsBoat === undefined || existsBoat === null) {
                return res.status(404).json({ 'Error': 'No boat with this boat_id exists' });
            } else if (existsBoat.owner !== req.auth.sub) {
                console.log(existsBoat.owner);
                console.log(req.auth.sub);
                return res.status(403).send('{"Error": "Unathorized: access denied, boat doesn\'t belong to user."}')
            } else if (existsBoat.loads.length !== 0) {
                for (let x in existsBoat.loads) {
                    const existsLoad = loads.getLoad(existsBoat.loads[x].id)
                    Promise.all([existsLoad])
                        .then(data => {
                            let existsLoads = data[0][0];
                            const results = null;
                            loads.patchLoad(existsLoads.id, existsLoads.volume, existsLoads.item, existsLoads.creation_date, results)
                                .then(() => { return });
                        });
                }
                deleteBoat(existsBoat.id)
                    .then(() => { return res.status(204).send() });
            } else {
                deleteBoat(existsBoat.id)
                    .then(() => { return res.status(204).send() });
            }
        });
});

router.delete('/', function (req, res) {
    res.set('Accept', 'GET, POST');
    res.status(405).send('{"Error": "Not allowed to delete all boats"}').end();
});

router.put('/', function (req, res) {
    res.set('Accept', 'GET, POST');
    res.status(405).send('{"Error": "Not allowed to edit all boats"}').end();
});

/* ------------- End Controller Functions ------------- */

module.exports = router;
exports.getBoat = getBoat;
exports.getBoats = getBoats;
exports.patchBoat = patchBoat;