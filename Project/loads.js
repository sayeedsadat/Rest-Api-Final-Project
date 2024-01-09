const express = require('express');
const bodyParser = require('body-parser');
const router = express.Router();
const boats = require('./boats');

const gds = require('./datastore');
const datastore = gds.datastore;


const LOADS = "Loads";
const BOATS = "Boats";

router.use(bodyParser.json());



function checkNullUndefined(item) {
    let invalid = false;

    if (item.volume === null || item.volume === undefined) {
        invalid = true;
    }

    if (item.item === null || item.item === undefined) {
        invalid = true;
    }

    if (item.creation_date === null || item.creation_date === undefined) {
        invalid = true;
    }

    return invalid;
}

/* ------------- Begin guest Model Functions ------------- */
function addSelfLinkLoad(item, url, type) {
    if (item.carrier !== null) {
        selfurl = url + "/" + type + "/" + item.carrier.id;
        item.carrier.self = selfurl;
    }
    return item;
}

function getLoads(req) {
    let q = datastore.createQuery(LOADS).limit(5);
    const results = {};
    let prev;

    if (Object.keys(req.query).includes("cursor")) {
        prev = req.protocol + "://" + req.get("host") + req.baseUrl + "?cursor=" + req.query.cursor;
        q = q.start(req.query.cursor);
    }
    return datastore.runQuery(q).then((entities) => {
        let temp = entities[0].map(gds.fromDatastore)
        results.count = temp.length;
        results.loads = entities[0].map(gds.fromDatastore);
        if (typeof prev !== 'undefined') {
            results.previous = prev;
        }
        if (entities[1].moreResults !== gds.Datastore.NO_MORE_RESULTS) {
            results.next = req.protocol + "://" + req.get("host") + req.baseUrl + "?cursor=" + entities[1].endCursor;
        }
        return results;
    });
}

function createLoad(volume, item, creation_date) {
    let key = datastore.key(LOADS);
    const new_load = { "volume": volume, "carrier": null, "item": item, "creation_date": creation_date };
    return datastore.save({ "key": key, "data": new_load }).then(() => { return key });
}

function getLoad(id) {
    const key = datastore.key([LOADS, parseInt(id, 10)]);
    return datastore.get(key).then((entity) => {
        if (entity[0] === undefined || entity[0] === null) {
            return entity;
        } else {
            return entity.map(gds.fromDatastore);
        }
    });
}

function patchLoad(id, volume, item, creation_date, carrier) {
    let key = datastore.key([LOADS, parseInt(id, 10)]);
    const new_load = { "volume": volume, "carrier": carrier, "item": item, "creation_date": creation_date };
    return datastore.update({ "key": key, "data": new_load }).then(() => { return key });
}

function delete_load(id) {
    const key = datastore.key([LOADS, parseInt(id, 10)]);
    return datastore.delete(key);
}
/* ------------- End Model Functions ------------- */

/* ------------- Begin Controller Functions ------------- */
router.get('/', function (req, res) {
    getLoads(req)
        .then((loads) => {
            for (let x in loads.loads) {
                self_url = req.protocol + "://" + req.get("host");
                loads.loads[x] = addSelfLinkLoad(loads.loads[x], self_url, "boats")
                loads.loads[x].self = self_url + req.baseUrl + "/" + loads.loads[x].id;
            }
            return res.status(200).json(loads);
        });
});

router.post('/', function (req, res) {
    if (req.get('content-type') !== 'application/json') {
        res.status(415).send('{"Error": "Server only accepts application/json data."}')
    }

    const accepts = req.accepts(['application/json']);
    if (!accepts) {
        return res.status(406).send('{"Error": "Not acceptable, response is in application/json only."}');
    } else if (accepts === 'application/json') {
        if (req.body.volume == null || req.body.item == null || req.body.creation_date == null) {
            res.status(400).send('{"Error": "The request object is missing at least one of the required attributes"}')
        }
        else {
            createLoad(req.body.volume, req.body.item, req.body.creation_date)
                .then(key => {
                    selfurl = req.protocol + "://" + req.get("host") + req.baseUrl + "/" + key.id;
                    return res.status(201).send('{ "id": ' + key.id + ', "volume": ' + req.body.volume + ', "carrier": null' + ', "item": "'
                        + req.body.item + '", "creation_date": "' + req.body.creation_date + '", "self": "' + selfurl + '" }')
                });
        }
    }
});

router.patch('/:load_id', function (req, res) {
    if (req.get('content-type') !== 'application/json') {
        res.status(415).send('{"Error": "Server only accepts application/json data."}')
    }
    console.log("here")
    const accepts = req.accepts(['application/json']);
    if (!accepts) {
        return res.status(406).send('{"Error": "Not acceptable, response is in application/json only."}');
    } else if (accepts === 'application/json') {
        const loadExists = getLoad(req.params.load_id)
            .then(load => {
                console.log(load);
                if (load[0] == undefined || load[0] == null) {
                    return res.status(404).json({ 'Error': 'No load with this load_id exists' });
                } else {
                    return load[0];
                }
            });

        Promise.all([loadExists])
            .then(data => {
                const load = data[0];
                console.log(load);
                let volume = (req.body.volume === undefined) ? load.volume : req.body.volume;
                let carrier = load.carrier;
                let item = (req.body.item === undefined) ? load.item : req.body.item;
                let creationDate = (req.body.creation_date === undefined) ? load.creation_date : req.body.creation_date;
                console.log("Here");
                patchLoad(req.params.load_id, volume, item, creationDate, carrier)
                    .then(key => getLoad(key.id))
                    .then(updatedLoad => {
                        updatedLoad[0].self = req.protocol + "://" + req.get("host") + req.baseUrl + "/" + updatedLoad[0].id;
                        return res.status(200).send(updatedLoad[0]);
                    });
            });
    }
});

router.put('/:load_id', function (req, res) {
    if (req.get('content-type') !== 'application/json') {
        res.status(415).send('{"Error": "Server only accepts application/json data."}')
    }

    const accepts = req.accepts(['application/json']);
    if (!accepts) {
        return res.status(406).send('{"Error": "Not acceptable, response is in application/json only."}');
    } else if (accepts === 'application/json') {
        if (checkNullUndefined(req.body)) {
            res.status(400).send('{"Error": "The request object is missing at least one of the required attributes"}')
        }
        console.log("here");
        const loadExists = getLoad(req.params.load_id)
            .then(load => {
                console.log(load);
                if (load[0] == undefined || load[0] == null) {
                    return res.status(404).json({ 'Error': 'No load with this load_id exists' });
                } else {
                    return load[0];
                }
            });

        Promise.all([loadExists])
            .then(data => {
                const load = data[0];
                console.log(load);
                let volume = (req.body.volume === undefined) ? load.volume : req.body.volume;
                let carrier = load.carrier;
                let item = (req.body.item === undefined) ? load.item : req.body.item;
                let creationDate = (req.body.creation_date === undefined) ? load.creation_date : req.body.creation_date;

                patchLoad(req.params.load_id, volume, item, creationDate, carrier)
                    .then(key => getLoad(key.id))
                    .then(updatedLoad => {
                        updatedLoad[0].self = req.protocol + "://" + req.get("host") + req.baseUrl + "/" + updatedLoad[0].id;
                        return res.status(200).send(updatedLoad[0]);
                    });
            });
    }
});


router.get('/:load_id', function (req, res) {
    const accepts = req.accepts(['application/json']);
    if (!accepts) {
        return res.status(406).send('{"Error": "Not acceptable, response is in application/json only."}');
    } else if (accepts === 'application/json') {
        getLoad(req.params.load_id)
            .then(load => {
                if (load[0] === undefined || load[0] === null) {
                    return res.status(404).json({ 'Error': 'No load with this load_id exists' });
                } else {
                    self_url = req.protocol + "://" + req.get("host");
                    let item = addSelfLinkLoad(load[0], self_url, "boats")
                    item.self = self_url + req.baseUrl + "/" + load[0].id;
                    return res.status(200).json(item);
                }
            });
    }
});

router.delete('/:load_id', function (req, res) {
    const loadExists = getLoad(req.params.load_id)

    Promise.all([loadExists])
        .then(data => {
            let existsLoad = data[0][0];
            console.log(existsLoad);
            if (existsLoad === undefined || existsLoad === null) {
                return res.status(404).json({ 'Error': 'No load with this load_id exists' });
            } else if (existsLoad.carrier !== null) {
                const boatExists = boats.getBoat(existsLoad.carrier.id)

                Promise.all([boatExists])
                    .then(data => {
                        let existsBoats = data[0][0];

                        if (existsBoats === undefined || existsBoats === null) {
                            return res.status(404).json({ 'Error': 'No boat with this boat_id exists' });
                        } else {
                            let load_items = existsBoats.loads.filter(item => { return item.id !== existsLoad.id });
                            return boats.patchBoat(existsBoats.id, existsBoats.name, existsBoats.type, existsBoats.length, load_items, existsBoats.owner)
                                .then(() => { return res.status(204).send() });
                        }
                    });
                delete_load(existsLoad.id)
                    .then(() => { return res.status(204).send() });
            }else if(existsLoad){
                delete_load(existsLoad.id)
                    .then(() => { return res.status(204).send() });
            } 
            else {
                return res.status(404).json({ 'Error': 'No load with this load_id exists' });
            }
        });
});



/* ------------- End Controller Functions ------------- */

module.exports = router;
module.exports.getLoad = getLoad;
module.exports.getLoads = getLoads;
module.exports.patchLoad = patchLoad;
module.exports.addSelfLinkLoad = addSelfLinkLoad;

